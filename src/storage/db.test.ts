// fake-indexeddb is installed via bunfig.toml's `[test] preload`, not a plain
// import here — Dexie caches `indexedDB` off the global at *module-load
// time* of the "dexie" package itself (not per-Dexie-instance), so it has to
// be in place before anything transitively imports "dexie", regardless of
// which test file runs first or what order its own imports are listed in.
// A plain top-of-file `import "fake-indexeddb/auto"` was tried first and
// intermittently failed with DexieError "IndexedDB API missing" for exactly
// this reason. Re-imported here anyway (idempotent) so this file is
// self-contained if ever run outside the configured bunfig.toml preload.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  TLDRAW_DB_PREFIX,
  cleanupOrphanedCanvasStores,
  createBoard,
  createCanvas,
  createNotebook,
  createPDFDocument,
  createPage,
  db,
  deleteCanvas,
  deleteNotebook,
  deletePDFDocument,
  deletePage,
  getCanvasesByPage,
  getPage,
  savePDFFile,
  setActiveCanvas,
} from "./db";

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));

  // Also clear any fake tldraw stores a previous test created — they live
  // in the fake-indexeddb factory, not a Dexie table, so table.clear()
  // above doesn't touch them. Left alone, a store created in one test would
  // still be there (and now orphaned, since its Dexie row was just cleared)
  // when a later test runs, corrupting cleanupOrphanedCanvasStores' count.
  const databases = await indexedDB.databases();
  await Promise.all(
    databases
      .filter((d) => d.name && d.name !== db.name)
      .map(
        (d) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(d.name!);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          })
      )
  );
});

// Simulates a pre-existing tldraw markup store for the given persistenceKey
// (a Board/Page/Canvas that already has strokes) — deleteTldrawData should
// remove exactly this database when the owning row is deleted.
function createFakeTldrawStore(persistenceKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`${TLDRAW_DB_PREFIX}${persistenceKey}`);
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

async function tldrawStoreExists(persistenceKey: string): Promise<boolean> {
  const databases = await indexedDB.databases();
  return databases.some((d) => d.name === `${TLDRAW_DB_PREFIX}${persistenceKey}`);
}

describe("deleteNotebook cascade", () => {
  test("removes the notebook's Board, PDFDocument, Page, Canvas rows and their tldraw stores, with zero orphans", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    await savePDFFile(pdf.id, new ArrayBuffer(8));
    const page = await createPage(pdf.id, 0, 612, 792);
    const [canvas0] = await getCanvasesByPage(page.id);
    const canvas1 = await createCanvas(page.id, "Canvas 1");

    await createFakeTldrawStore(`board-${board.id}`);
    await createFakeTldrawStore(`page-${page.id}`);
    await createFakeTldrawStore(`canvas-${canvas0.id}`);

    await deleteNotebook(notebook.id);

    expect(await db.notebooks.get(notebook.id)).toBeUndefined();
    expect(await db.boards.get(board.id)).toBeUndefined();
    expect(await db.pdfDocuments.get(pdf.id)).toBeUndefined();
    expect(await db.pdfFiles.get(pdf.id)).toBeUndefined();
    expect(await db.pages.get(page.id)).toBeUndefined();
    expect(await db.canvases.get(canvas0.id)).toBeUndefined();
    expect(await db.canvases.get(canvas1.id)).toBeUndefined();

    expect(await tldrawStoreExists(`board-${board.id}`)).toBe(false);
    expect(await tldrawStoreExists(`page-${page.id}`)).toBe(false);
    expect(await tldrawStoreExists(`canvas-${canvas0.id}`)).toBe(false);
  });

  test("does not touch a sibling notebook's data", async () => {
    const doomed = await createNotebook("Doomed");
    const survivor = await createNotebook("Survivor");
    const survivorBoard = await createBoard(survivor.id, "Keep me");
    await createBoard(doomed.id, "Delete me");

    await deleteNotebook(doomed.id);

    expect(await db.notebooks.get(survivor.id)).toBeDefined();
    expect(await db.boards.get(survivorBoard.id)).toBeDefined();
    expect(await db.boards.where("notebookId").equals(doomed.id).count()).toBe(0);
  });
});

describe("deletePDFDocument cascade", () => {
  test("removes Pages and Canvases and their tldraw stores, with zero orphans", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    await savePDFFile(pdf.id, new ArrayBuffer(8));
    const pageA = await createPage(pdf.id, 0, 612, 792);
    const pageB = await createPage(pdf.id, 1, 612, 792);
    const [canvasA] = await getCanvasesByPage(pageA.id);
    const [canvasB] = await getCanvasesByPage(pageB.id);

    await createFakeTldrawStore(`page-${pageA.id}`);
    await createFakeTldrawStore(`page-${pageB.id}`);
    await createFakeTldrawStore(`canvas-${canvasA.id}`);

    await deletePDFDocument(pdf.id);

    expect(await db.pdfDocuments.get(pdf.id)).toBeUndefined();
    expect(await db.pdfFiles.get(pdf.id)).toBeUndefined();
    expect(await db.pages.get(pageA.id)).toBeUndefined();
    expect(await db.pages.get(pageB.id)).toBeUndefined();
    expect(await db.canvases.get(canvasA.id)).toBeUndefined();
    expect(await db.canvases.get(canvasB.id)).toBeUndefined();

    expect(await tldrawStoreExists(`page-${pageA.id}`)).toBe(false);
    expect(await tldrawStoreExists(`page-${pageB.id}`)).toBe(false);
    expect(await tldrawStoreExists(`canvas-${canvasA.id}`)).toBe(false);
  });
});

describe("deletePage cascade", () => {
  test("removes the page's Canvases and their tldraw stores, with zero orphans, without touching sibling pages", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const doomedPage = await createPage(pdf.id, 0, 612, 792);
    const survivorPage = await createPage(pdf.id, 1, 612, 792);
    const [doomedCanvas] = await getCanvasesByPage(doomedPage.id);
    const [survivorCanvas] = await getCanvasesByPage(survivorPage.id);

    await createFakeTldrawStore(`page-${doomedPage.id}`);
    await createFakeTldrawStore(`canvas-${doomedCanvas.id}`);

    await deletePage(doomedPage.id);

    expect(await db.pages.get(doomedPage.id)).toBeUndefined();
    expect(await db.canvases.get(doomedCanvas.id)).toBeUndefined();
    expect(await tldrawStoreExists(`page-${doomedPage.id}`)).toBe(false);
    expect(await tldrawStoreExists(`canvas-${doomedCanvas.id}`)).toBe(false);

    // Sibling page untouched
    expect(await db.pages.get(survivorPage.id)).toBeDefined();
    expect(await db.canvases.get(survivorCanvas.id)).toBeDefined();
  });
});

describe("deleteCanvas", () => {
  test("throws when asked to delete a page's last remaining canvas", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);
    const [onlyCanvas] = await getCanvasesByPage(page.id);

    await expect(deleteCanvas(onlyCanvas.id)).rejects.toThrow(
      "Cannot delete the last remaining canvas on a page"
    );
    // Still there — the guard didn't delete it before throwing.
    expect(await db.canvases.get(onlyCanvas.id)).toBeDefined();
  });

  test("reassigns the next-lowest-order sibling as active when the deleted canvas was active", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);
    const [canvas0] = await getCanvasesByPage(page.id); // active by default
    const canvas1 = await createCanvas(page.id, "Canvas 1");
    const canvas2 = await createCanvas(page.id, "Canvas 2");

    expect((await getPage(page.id))?.activeCanvasId).toBe(canvas0.id);

    await deleteCanvas(canvas0.id);

    const remaining = await getCanvasesByPage(page.id);
    expect(remaining.map((c) => c.id)).toEqual([canvas1.id, canvas2.id]);

    const refreshedPage = await getPage(page.id);
    expect(refreshedPage?.activeCanvasId).toBe(canvas1.id); // next-lowest-order sibling
    expect(remaining.find((c) => c.id === canvas1.id)?.isActive).toBe(true);
    expect(remaining.find((c) => c.id === canvas2.id)?.isActive).toBe(false);
  });

  test("deleting a non-active canvas leaves the active canvas unchanged", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);
    const [canvas0] = await getCanvasesByPage(page.id);
    const canvas1 = await createCanvas(page.id, "Canvas 1");
    await setActiveCanvas(page.id, canvas0.id);

    await deleteCanvas(canvas1.id);

    expect((await getPage(page.id))?.activeCanvasId).toBe(canvas0.id);
    expect(await db.canvases.get(canvas1.id)).toBeUndefined();
  });

  test("removes the deleted canvas's tldraw store", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);
    const canvas1 = await createCanvas(page.id, "Canvas 1");
    await createFakeTldrawStore(`canvas-${canvas1.id}`);

    await deleteCanvas(canvas1.id);

    expect(await tldrawStoreExists(`canvas-${canvas1.id}`)).toBe(false);
  });
});

describe("cleanupOrphanedCanvasStores", () => {
  test("removes canvas-${id} stores with no matching Canvas row, and leaves live ones alone", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);
    const [liveCanvas] = await getCanvasesByPage(page.id);

    await createFakeTldrawStore(`canvas-${liveCanvas.id}`); // still has a Canvas row
    await createFakeTldrawStore("canvas-cv_orphan_1"); // pre-migration leftover, no row
    await createFakeTldrawStore("canvas-cv_orphan_2"); // pre-migration leftover, no row

    const removed = await cleanupOrphanedCanvasStores();

    expect(removed.sort()).toEqual(["cv_orphan_1", "cv_orphan_2"]);
    expect(await tldrawStoreExists(`canvas-${liveCanvas.id}`)).toBe(true);
    expect(await tldrawStoreExists("canvas-cv_orphan_1")).toBe(false);
    expect(await tldrawStoreExists("canvas-cv_orphan_2")).toBe(false);
  });

  test("is idempotent — a second run finds nothing left to remove", async () => {
    await createFakeTldrawStore("canvas-cv_orphan");

    const firstRun = await cleanupOrphanedCanvasStores();
    expect(firstRun).toEqual(["cv_orphan"]);

    const secondRun = await cleanupOrphanedCanvasStores();
    expect(secondRun).toEqual([]);
  });

  test("does not touch non-canvas tldraw stores (board-*, page-*)", async () => {
    await createFakeTldrawStore("board-bd_1");
    await createFakeTldrawStore("page-pg_1");

    const removed = await cleanupOrphanedCanvasStores();

    expect(removed).toEqual([]);
    expect(await tldrawStoreExists("board-bd_1")).toBe(true);
    expect(await tldrawStoreExists("page-pg_1")).toBe(true);
  });
});
