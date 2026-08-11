// See tests/storage/db.test.ts for why fake-indexeddb/auto is imported both
// here and preloaded via bunfig.toml.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  TLDRAW_DB_PREFIX,
  createBoard,
  createNotebook,
  createPDFDocument,
  createPage,
  db,
  getBoardsByNotebook,
  getCanvasesByPage,
  getNotebooksList,
  getPDFsByNotebook,
  getTrashedItems,
  permanentlyDeleteBoard,
  permanentlyDeleteNotebook,
  permanentlyDeletePDFDocument,
  restoreBoard,
  restoreNotebook,
  restorePDFDocument,
  savePDFFile,
  searchAll,
  softDeleteBoard,
  softDeleteNotebook,
  softDeletePDFDocument,
} from "../../src/storage/db";

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
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

describe("softDeleteNotebook", () => {
  test("sets deletedAt on the notebook and cascades to its Boards/PDFDocuments", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");

    await softDeleteNotebook(notebook.id);

    const refreshedNotebook = await db.notebooks.get(notebook.id);
    const refreshedBoard = await db.boards.get(board.id);
    const refreshedPdf = await db.pdfDocuments.get(pdf.id);

    expect(refreshedNotebook?.deletedAt).not.toBeNull();
    expect(refreshedBoard?.deletedAt).not.toBeNull();
    expect(refreshedPdf?.deletedAt).not.toBeNull();
    // Cascade timestamp matches the parent's, so restore can distinguish
    // cascade-deleted children from independently-deleted ones.
    expect(refreshedBoard?.deletedAt).toBe(refreshedNotebook!.deletedAt);
    expect(refreshedPdf?.deletedAt).toBe(refreshedNotebook!.deletedAt);

    // Rows still exist — this is a soft delete, not a real one.
    expect(await db.boards.get(board.id)).toBeDefined();
    expect(await db.pdfDocuments.get(pdf.id)).toBeDefined();
  });

  test("does not touch an already-independently-deleted child's timestamp", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");
    await softDeleteBoard(board.id);
    const boardDeletedAt = (await db.boards.get(board.id))?.deletedAt;

    await softDeleteNotebook(notebook.id);

    // Board keeps its own original deletedAt, not overwritten by the
    // notebook's cascade (it was already trashed).
    expect((await db.boards.get(board.id))?.deletedAt).toBe(boardDeletedAt!);
  });

  test("does not touch a sibling notebook or its children", async () => {
    const doomed = await createNotebook("Doomed");
    const survivor = await createNotebook("Survivor");
    const survivorBoard = await createBoard(survivor.id, "Keep me");

    await softDeleteNotebook(doomed.id);

    expect((await db.notebooks.get(survivor.id))?.deletedAt).toBeNull();
    expect((await db.boards.get(survivorBoard.id))?.deletedAt).toBeNull();
  });
});

describe("restoreNotebook", () => {
  test("clears deletedAt on the notebook and cascades restore to children deleted at the same time", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");

    await softDeleteNotebook(notebook.id);
    await restoreNotebook(notebook.id);

    expect((await db.notebooks.get(notebook.id))?.deletedAt).toBeNull();
    expect((await db.boards.get(board.id))?.deletedAt).toBeNull();
    expect((await db.pdfDocuments.get(pdf.id))?.deletedAt).toBeNull();
  });

  test("leaves an independently-deleted child still trashed", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Independently trashed board");

    await softDeleteBoard(board.id); // trashed on its own, before the notebook
    // Cascade-matching is millisecond-precision (see softDeleteNotebook) —
    // force the two deletes into different milliseconds, same as two
    // separate user actions would naturally be in real usage.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await softDeleteNotebook(notebook.id); // cascades to nothing (already deleted)
    await restoreNotebook(notebook.id);

    // Notebook comes back...
    expect((await db.notebooks.get(notebook.id))?.deletedAt).toBeNull();
    // ...but the board, trashed independently earlier, stays trashed.
    expect((await db.boards.get(board.id))?.deletedAt).not.toBeNull();
  });

  test("is a no-op on a notebook that isn't deleted", async () => {
    const notebook = await createNotebook("Test Notebook");
    await restoreNotebook(notebook.id); // should not throw
    expect((await db.notebooks.get(notebook.id))?.deletedAt).toBeNull();
  });
});

describe("permanentlyDeleteNotebook", () => {
  test("removes the notebook subtree and tldraw stores for good, regardless of trashed state", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    await savePDFFile(pdf.id, new ArrayBuffer(8));
    const page = await createPage(pdf.id, 0, 612, 792);
    const [canvas0] = await getCanvasesByPage(page.id);

    await createFakeTldrawStore(`board-${board.id}`);
    await createFakeTldrawStore(`page-${page.id}`);
    await createFakeTldrawStore(`canvas-${canvas0.id}`);

    await softDeleteNotebook(notebook.id);
    await permanentlyDeleteNotebook(notebook.id);

    expect(await db.notebooks.get(notebook.id)).toBeUndefined();
    expect(await db.boards.get(board.id)).toBeUndefined();
    expect(await db.pdfDocuments.get(pdf.id)).toBeUndefined();
    expect(await db.pdfFiles.get(pdf.id)).toBeUndefined();
    expect(await db.pages.get(page.id)).toBeUndefined();
    expect(await db.canvases.get(canvas0.id)).toBeUndefined();

    expect(await tldrawStoreExists(`board-${board.id}`)).toBe(false);
    expect(await tldrawStoreExists(`page-${page.id}`)).toBe(false);
    expect(await tldrawStoreExists(`canvas-${canvas0.id}`)).toBe(false);
  });
});

describe("Board trash lifecycle", () => {
  test("softDeleteBoard sets deletedAt without removing the row", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");

    await softDeleteBoard(board.id);

    const refreshed = await db.boards.get(board.id);
    expect(refreshed).toBeDefined();
    expect(refreshed?.deletedAt).not.toBeNull();
  });

  test("restoreBoard clears deletedAt", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");

    await softDeleteBoard(board.id);
    await restoreBoard(board.id);

    expect((await db.boards.get(board.id))?.deletedAt).toBeNull();
  });

  test("permanentlyDeleteBoard removes the row and its tldraw store", async () => {
    const notebook = await createNotebook("Test Notebook");
    const board = await createBoard(notebook.id, "Test Board");
    await createFakeTldrawStore(`board-${board.id}`);

    await softDeleteBoard(board.id);
    await permanentlyDeleteBoard(board.id);

    expect(await db.boards.get(board.id)).toBeUndefined();
    expect(await tldrawStoreExists(`board-${board.id}`)).toBe(false);
  });
});

describe("PDFDocument trash lifecycle", () => {
  test("softDeletePDFDocument leaves Pages/Canvases as live rows (decision: Page/Canvas stay hard-delete-only)", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);
    const [canvas0] = await getCanvasesByPage(page.id);

    await softDeletePDFDocument(pdf.id);

    expect((await db.pdfDocuments.get(pdf.id))?.deletedAt).not.toBeNull();
    // Untouched — not soft-deleted themselves, per the documented decision.
    expect(await db.pages.get(page.id)).toBeDefined();
    expect(await db.canvases.get(canvas0.id)).toBeDefined();
  });

  test("restorePDFDocument clears deletedAt and its Pages/Canvases are still there", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);

    await softDeletePDFDocument(pdf.id);
    await restorePDFDocument(pdf.id);

    expect((await db.pdfDocuments.get(pdf.id))?.deletedAt).toBeNull();
    expect(await db.pages.get(page.id)).toBeDefined();
  });

  test("permanentlyDeletePDFDocument really removes Pages/Canvases/pdfFiles and their tldraw stores", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    await savePDFFile(pdf.id, new ArrayBuffer(8));
    const page = await createPage(pdf.id, 0, 612, 792);
    const [canvas0] = await getCanvasesByPage(page.id);
    await createFakeTldrawStore(`page-${page.id}`);
    await createFakeTldrawStore(`canvas-${canvas0.id}`);

    await softDeletePDFDocument(pdf.id);
    await permanentlyDeletePDFDocument(pdf.id);

    expect(await db.pdfDocuments.get(pdf.id)).toBeUndefined();
    expect(await db.pdfFiles.get(pdf.id)).toBeUndefined();
    expect(await db.pages.get(page.id)).toBeUndefined();
    expect(await db.canvases.get(canvas0.id)).toBeUndefined();
    expect(await tldrawStoreExists(`page-${page.id}`)).toBe(false);
    expect(await tldrawStoreExists(`canvas-${canvas0.id}`)).toBe(false);
  });
});

describe("list/query functions exclude soft-deleted items by default", () => {
  test("getNotebooksList excludes trashed notebooks", async () => {
    const kept = await createNotebook("Kept");
    const trashed = await createNotebook("Trashed");
    await softDeleteNotebook(trashed.id);

    const list = await getNotebooksList();
    expect(list.map((n) => n.id)).toEqual([kept.id]);
  });

  test("getBoardsByNotebook excludes trashed boards", async () => {
    const notebook = await createNotebook("Test Notebook");
    const kept = await createBoard(notebook.id, "Kept");
    const trashed = await createBoard(notebook.id, "Trashed");
    await softDeleteBoard(trashed.id);

    const list = await getBoardsByNotebook(notebook.id);
    expect(list.map((b) => b.id)).toEqual([kept.id]);
  });

  test("getPDFsByNotebook excludes trashed PDFs", async () => {
    const notebook = await createNotebook("Test Notebook");
    const kept = await createPDFDocument(notebook.id, "Kept", "kept.pdf");
    const trashed = await createPDFDocument(notebook.id, "Trashed", "trashed.pdf");
    await softDeletePDFDocument(trashed.id);

    const list = await getPDFsByNotebook(notebook.id);
    expect(list.map((p) => p.id)).toEqual([kept.id]);
  });

  test("searchAll excludes trashed items", async () => {
    const notebook = await createNotebook("Findme Notebook");
    const board = await createBoard(notebook.id, "Findme Board");
    await softDeleteNotebook(notebook.id); // cascades to the board too

    const results = await searchAll("findme");
    expect(results.notebooks).toEqual([]);
    expect(results.boards).toEqual([]);
    void board;
  });
});

describe("getTrashedItems", () => {
  test("returns exactly the soft-deleted Notebooks/Boards/PDFDocuments", async () => {
    const liveNotebook = await createNotebook("Live");
    const trashedNotebook = await createNotebook("Trashed Notebook");
    const liveBoard = await createBoard(liveNotebook.id, "Live Board");
    const trashedBoard = await createBoard(liveNotebook.id, "Trashed Board");
    const livePdf = await createPDFDocument(liveNotebook.id, "Live PDF", "live.pdf");
    const trashedPdf = await createPDFDocument(liveNotebook.id, "Trashed PDF", "trashed.pdf");

    await softDeleteNotebook(trashedNotebook.id);
    await softDeleteBoard(trashedBoard.id);
    await softDeletePDFDocument(trashedPdf.id);

    const trash = await getTrashedItems();
    expect(trash.notebooks.map((n) => n.id)).toEqual([trashedNotebook.id]);
    expect(trash.boards.map((b) => b.id)).toEqual([trashedBoard.id]);
    expect(trash.pdfs.map((p) => p.id)).toEqual([trashedPdf.id]);

    expect(trash.notebooks.map((n) => n.id)).not.toContain(liveNotebook.id);
    expect(trash.boards.map((b) => b.id)).not.toContain(liveBoard.id);
    expect(trash.pdfs.map((p) => p.id)).not.toContain(livePdf.id);
  });
});
