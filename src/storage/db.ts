import Dexie, { type Table } from "dexie";
import type { Notebook, Board, PDFDocument, PDFFile, Page, Canvas } from "./types";

export class MarginalDB extends Dexie {
  notebooks!: Table<Notebook>;
  boards!: Table<Board>;
  pdfDocuments!: Table<PDFDocument>;
  pdfFiles!: Table<PDFFile>;
  pages!: Table<Page>;
  canvases!: Table<Canvas>;

  constructor() {
    super("marginal");
    this.version(1).stores({
      notebooks: "id, order, createdAt",
      boards: "id, notebookId, order, createdAt",
      pdfDocuments: "id, notebookId, createdAt",
      pages: "id, pdfDocumentId, pageNumber, createdAt",
      canvases: "id, pageId, order, createdAt",
    });
    // v2: raw PDF bytes in their own table, keyed by pdfDocumentId, so
    // metadata queries never pull file contents.
    this.version(2).stores({
      pdfFiles: "pdfDocumentId",
    });
    // v3: Canvas.lastCameraPosition (single-canvas migration — see
    // data-model.md § Canvas and build-order.md § Single Canvas Migration).
    // Not an indexed field, so the store's index string is unchanged; the
    // version bump exists to run the backfill below.
    this.version(3)
      .stores({
        canvases: "id, pageId, order, createdAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("canvases")
          .toCollection()
          .modify((canvas) => {
            canvas.lastCameraPosition = null;
          });
      });
    // v4: Trash (soft-delete) + reordering — see data-model.md § Trash and
    // § Reordering. `deletedAt` added to notebooks/boards/pdfDocuments
    // (backfilled to null — nothing is deleted by this migration). Only
    // pdfDocuments' index string actually changes here (new `order` field,
    // backfilled from existing createdAt order, matching how Boards already
    // work) — notebooks/boards keep their v1 index shape, but the upgrade
    // callback still touches all three tables via `tx.table(...)`, which
    // Dexie makes available regardless of which stores are redeclared in
    // this version's `.stores()` call (same pattern v3 used for canvases).
    this.version(4)
      .stores({
        pdfDocuments: "id, notebookId, order, createdAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("notebooks")
          .toCollection()
          .modify((notebook) => {
            notebook.deletedAt = null;
          });
        await tx
          .table("boards")
          .toCollection()
          .modify((board) => {
            board.deletedAt = null;
          });
        const pdfs = await tx.table("pdfDocuments").orderBy("createdAt").toArray();
        for (let i = 0; i < pdfs.length; i++) {
          await tx.table("pdfDocuments").update(pdfs[i].id, { deletedAt: null, order: i + 1 });
        }
      });
  }
}

export const db = new MarginalDB();

// tldraw persists each surface's strokes in its own IndexedDB database named
// `${TLDRAW_DB_PREFIX}${persistenceKey}`. Deleting a Board or Page must also
// delete that database, or the markup would be orphaned forever.
//
// Single Canvas Migration note: `canvas-${id}` stores are no longer created
// (a Canvas's shapes now live tagged inside `page-${pageId}`) — the
// `deleteTldrawData("canvas-...")` calls below are kept only as harmless
// best-effort cleanup of that legacy per-canvas store name, in case one
// exists from before this migration; deleting a database that was never
// created is a no-op. Pre-migration canvas content in those legacy stores is
// **not** migrated into the shared page store — flagged per build-order.md §
// Single Canvas Migration rather than attempting a complex data transform on
// pre-MVP dev data.
export const TLDRAW_DB_PREFIX = "TLDRAW_DOCUMENT_v2";

export function deleteTldrawData(persistenceKey: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(`${TLDRAW_DB_PREFIX}${persistenceKey}`);
    // Resolve on blocked too — deletion completes once open connections close.
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

// Notebook operations
export async function createNotebook(name: string): Promise<Notebook> {
  const order = (await db.notebooks.count()) + 1;
  const now = Date.now();
  const id = `nb_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const notebook: Notebook = {
    id,
    name,
    order,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.notebooks.add(notebook);
  return notebook;
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  return db.notebooks.get(id);
}

// Excludes soft-deleted notebooks by default — see § Trash below.
export async function getNotebooksList(): Promise<Notebook[]> {
  return db.notebooks
    .orderBy("order")
    .filter((n) => n.deletedAt == null)
    .toArray();
}

export async function updateNotebook(
  id: string,
  updates: Partial<Omit<Notebook, "id">>
): Promise<void> {
  await db.notebooks.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// --- Trash (soft-delete) ---------------------------------------------------
// See data-model.md § Trash for the full policy. Summary: deleting a
// Notebook/Board/PDFDocument from normal UI sets `deletedAt` instead of
// removing the row — restorable until someone explicitly purges it from the
// Trash view (permanentlyDelete*), which reuses the real cascade-delete
// logic below. Page and Canvas are NOT soft-deletable (see § Trash — Page
// and Canvas decision) — they stay hard-delete-only, unaffected by any of
// this; a soft-deleted PDFDocument's Pages/Canvases are simply left as
// ordinary rows, unreachable through normal UI because their parent no
// longer appears in it, and only actually removed by
// permanentlyDeletePDFDocument.

// Soft-deletes a Notebook and cascades the same soft-delete, with the same
// timestamp, to any of its Boards/PDFDocuments that aren't already
// soft-deleted — restoreNotebook uses that shared timestamp to know which
// children to bring back along with it (and which to leave alone, because
// they were independently trashed earlier/later). Matching is
// millisecond-precision (Date.now()); an independent delete landing in the
// exact same millisecond as a cascade would be mistaken for part of it, but
// that's not reachable from two distinct user actions (button clicks), only
// from calling both synchronously in code (e.g. a test) — acceptable for v1.
export async function softDeleteNotebook(id: string): Promise<void> {
  const now = Date.now();
  const boards = await db.boards
    .where("notebookId")
    .equals(id)
    .filter((b) => b.deletedAt == null)
    .toArray();
  const pdfs = await db.pdfDocuments
    .where("notebookId")
    .equals(id)
    .filter((p) => p.deletedAt == null)
    .toArray();

  await db.transaction("rw", db.notebooks, db.boards, db.pdfDocuments, async () => {
    await db.notebooks.update(id, { deletedAt: now, updatedAt: now });
    for (const board of boards) {
      await db.boards.update(board.id, { deletedAt: now, updatedAt: now });
    }
    for (const pdf of pdfs) {
      await db.pdfDocuments.update(pdf.id, { deletedAt: now, updatedAt: now });
    }
  });
}

// Clears deletedAt on a trashed Notebook and cascades the restore to
// whichever Boards/PDFDocuments were soft-deleted at the exact same moment
// (i.e. cascaded alongside it, not independently trashed before/after).
export async function restoreNotebook(id: string): Promise<void> {
  const notebook = await db.notebooks.get(id);
  if (!notebook || notebook.deletedAt == null) return;
  const cascadeTimestamp = notebook.deletedAt;
  const now = Date.now();

  const boards = await db.boards
    .where("notebookId")
    .equals(id)
    .filter((b) => b.deletedAt === cascadeTimestamp)
    .toArray();
  const pdfs = await db.pdfDocuments
    .where("notebookId")
    .equals(id)
    .filter((p) => p.deletedAt === cascadeTimestamp)
    .toArray();

  await db.transaction("rw", db.notebooks, db.boards, db.pdfDocuments, async () => {
    await db.notebooks.update(id, { deletedAt: null, updatedAt: now });
    for (const board of boards) {
      await db.boards.update(board.id, { deletedAt: null, updatedAt: now });
    }
    for (const pdf of pdfs) {
      await db.pdfDocuments.update(pdf.id, { deletedAt: null, updatedAt: now });
    }
  });
}

// The real cascade-delete — removes rows and tldraw stores for good. This is
// the old (pre-Trash) `deleteNotebook` logic, unchanged, now only reachable
// from the Trash view. Grabs every Board/PDFDocument/Page/Canvas under the
// notebook regardless of their own deletedAt state, since a permanent delete
// must remove everything, trashed or not.
export async function permanentlyDeleteNotebook(id: string): Promise<void> {
  // Collect the full subtree first so markup stores can be cleaned afterwards
  // (indexedDB.deleteDatabase can't run inside a Dexie transaction).
  const boards = await db.boards.where("notebookId").equals(id).toArray();
  const pdfs = await db.pdfDocuments.where("notebookId").equals(id).toArray();
  const pdfIds = pdfs.map((p) => p.id);
  const pages = pdfIds.length
    ? await db.pages.where("pdfDocumentId").anyOf(pdfIds).toArray()
    : [];
  const pageIds = pages.map((p) => p.id);
  const canvases = pageIds.length
    ? await db.canvases.where("pageId").anyOf(pageIds).toArray()
    : [];

  await db.transaction(
    "rw",
    [db.notebooks, db.boards, db.pdfDocuments, db.pdfFiles, db.pages, db.canvases],
    async () => {
      for (const board of boards) {
        await db.boards.delete(board.id);
      }
      for (const canvas of canvases) {
        await db.canvases.delete(canvas.id);
      }
      for (const page of pages) {
        await db.pages.delete(page.id);
      }
      for (const pdfId of pdfIds) {
        await db.pdfFiles.delete(pdfId);
        await db.pdfDocuments.delete(pdfId);
      }
      await db.notebooks.delete(id);
    }
  );

  for (const board of boards) {
    await deleteTldrawData(`board-${board.id}`);
  }
  for (const page of pages) {
    await deleteTldrawData(`page-${page.id}`);
  }
  for (const canvas of canvases) {
    await deleteTldrawData(`canvas-${canvas.id}`);
  }
}

// Board operations
export async function createBoard(notebookId: string, name: string): Promise<Board> {
  const order = (await db.boards.where("notebookId").equals(notebookId).count()) + 1;
  const now = Date.now();
  const id = `bd_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const board: Board = {
    id,
    notebookId,
    name,
    order,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.boards.add(board);
  return board;
}

export async function getBoard(id: string): Promise<Board | undefined> {
  return db.boards.get(id);
}

// Excludes soft-deleted boards by default — see § Trash above.
export async function getBoardsByNotebook(notebookId: string): Promise<Board[]> {
  const boards = await db.boards.where("notebookId").equals(notebookId).sortBy("order");
  return boards.filter((b) => b.deletedAt == null);
}

export async function updateBoard(
  id: string,
  updates: Partial<Omit<Board, "id" | "notebookId">>
): Promise<void> {
  await db.boards.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// Boards have no soft-deletable children (a Board's content lives entirely
// in its own tldraw store, not as Dexie rows) — soft-delete is just this row.
export async function softDeleteBoard(id: string): Promise<void> {
  await db.boards.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

export async function restoreBoard(id: string): Promise<void> {
  await db.boards.update(id, { deletedAt: null, updatedAt: Date.now() });
}

// The real cascade-delete — old (pre-Trash) `deleteBoard` logic, unchanged.
export async function permanentlyDeleteBoard(id: string): Promise<void> {
  await db.boards.delete(id);
  await deleteTldrawData(`board-${id}`);
}

// PDFDocument operations
export async function createPDFDocument(
  notebookId: string,
  name: string,
  fileName: string
): Promise<PDFDocument> {
  const order = (await db.pdfDocuments.where("notebookId").equals(notebookId).count()) + 1;
  const now = Date.now();
  const id = `pdf_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const pdf: PDFDocument = {
    id,
    notebookId,
    name,
    fileName,
    order,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.pdfDocuments.add(pdf);
  return pdf;
}

export async function getPDFDocument(id: string): Promise<PDFDocument | undefined> {
  return db.pdfDocuments.get(id);
}

// Excludes soft-deleted PDFs by default — see § Trash above. Sorted by
// `order` (v4) rather than `createdAt`, to support drag-to-reorder.
export async function getPDFsByNotebook(notebookId: string): Promise<PDFDocument[]> {
  const pdfs = await db.pdfDocuments.where("notebookId").equals(notebookId).sortBy("order");
  return pdfs.filter((p) => p.deletedAt == null);
}

export async function updatePDFDocument(
  id: string,
  updates: Partial<Omit<PDFDocument, "id" | "notebookId">>
): Promise<void> {
  await db.pdfDocuments.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// Soft-deletes a PDFDocument. Its Pages/Canvases are deliberately left
// untouched — see § Trash — Page and Canvas decision above; they become
// unreachable through normal UI (nothing queries them until the PDF is
// opened again) without needing a deletedAt field of their own.
export async function softDeletePDFDocument(id: string): Promise<void> {
  await db.pdfDocuments.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
}

export async function restorePDFDocument(id: string): Promise<void> {
  await db.pdfDocuments.update(id, { deletedAt: null, updatedAt: Date.now() });
}

// The real cascade-delete — old (pre-Trash) `deletePDFDocument` logic,
// unchanged. Removes Pages/Canvases/pdfFiles regardless of anything, since
// they were never soft-deleted in the first place.
export async function permanentlyDeletePDFDocument(id: string): Promise<void> {
  const pages = await db.pages.where("pdfDocumentId").equals(id).toArray();
  const pageIds = pages.map((p) => p.id);
  const canvases = pageIds.length
    ? await db.canvases.where("pageId").anyOf(pageIds).toArray()
    : [];

  await db.transaction("rw", db.pdfDocuments, db.pdfFiles, db.pages, db.canvases, async () => {
    for (const canvas of canvases) {
      await db.canvases.delete(canvas.id);
    }
    for (const page of pages) {
      await db.pages.delete(page.id);
    }
    await db.pdfFiles.delete(id);
    await db.pdfDocuments.delete(id);
  });

  // Markup stores live outside Dexie, so clean them after the transaction.
  for (const page of pages) {
    await deleteTldrawData(`page-${page.id}`);
  }
  for (const canvas of canvases) {
    await deleteTldrawData(`canvas-${canvas.id}`);
  }
}

// Reordering — see data-model.md § Reordering. Lightweight approach:
// reassign sequential 1..n `order` values in the given order, one Dexie
// update per item in a single transaction. Simpler than fractional-index
// insertion and correct enough at v1's data volumes (a notebook's board/PDF
// count, or a page's canvas count, is never large).
export async function reorderBoards(orderedIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.boards, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.boards.update(orderedIds[i], { order: i + 1, updatedAt: now });
    }
  });
}

export async function reorderPDFDocuments(orderedIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.pdfDocuments, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.pdfDocuments.update(orderedIds[i], { order: i + 1, updatedAt: now });
    }
  });
}

export async function savePDFFile(pdfDocumentId: string, data: ArrayBuffer): Promise<void> {
  await db.pdfFiles.put({ pdfDocumentId, data });
}

export async function getPDFFile(pdfDocumentId: string): Promise<ArrayBuffer | undefined> {
  const row = await db.pdfFiles.get(pdfDocumentId);
  return row?.data;
}

// Page operations
export async function createPage(
  pdfDocumentId: string,
  pageNumber: number,
  width: number,
  height: number
): Promise<Page> {
  const now = Date.now();
  const id = `pg_${now}_${Math.random().toString(36).substring(2, 9)}`;

  // Auto-create Canvas 0 as the active canvas
  const canvas = await createCanvas(id, `Canvas 0`);

  const page: Page = {
    id,
    pdfDocumentId,
    pageNumber,
    width,
    height,
    activeCanvasId: canvas.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.pages.add(page);
  return page;
}

export async function getPage(id: string): Promise<Page | undefined> {
  return db.pages.get(id);
}

export async function getPagesByPDF(pdfDocumentId: string): Promise<Page[]> {
  return db.pages.where("pdfDocumentId").equals(pdfDocumentId).sortBy("pageNumber");
}

export async function updatePage(
  id: string,
  updates: Partial<Omit<Page, "id" | "pdfDocumentId">>
): Promise<void> {
  await db.pages.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deletePage(id: string): Promise<void> {
  const canvases = await db.canvases.where("pageId").equals(id).toArray();

  await db.transaction("rw", db.pages, db.canvases, async () => {
    for (const canvas of canvases) {
      await db.canvases.delete(canvas.id);
    }
    await db.pages.delete(id);
  });

  // Markup stores live outside Dexie, so clean them after the transaction.
  await deleteTldrawData(`page-${id}`);
  for (const canvas of canvases) {
    await deleteTldrawData(`canvas-${canvas.id}`);
  }
}

// Canvas operations
export async function createCanvas(pageId: string, name: string): Promise<Canvas> {
  const order = (await db.canvases.where("pageId").equals(pageId).count()) + 1;
  const now = Date.now();
  const id = `cv_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const canvas: Canvas = {
    id,
    pageId,
    name,
    order,
    isActive: order === 1,
    lastCameraPosition: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.canvases.add(canvas);
  return canvas;
}

// Creates a new canvas and immediately makes it the page's active canvas —
// "+" tab auto-focuses per ui-interaction.md §5.
export async function createCanvasAndActivate(pageId: string, name: string): Promise<Canvas> {
  const canvas = await createCanvas(pageId, name);
  await setActiveCanvas(pageId, canvas.id);
  return canvas;
}

export async function getCanvas(id: string): Promise<Canvas | undefined> {
  return db.canvases.get(id);
}

export async function getCanvasesByPage(pageId: string): Promise<Canvas[]> {
  return db.canvases.where("pageId").equals(pageId).sortBy("order");
}

// Reorders a page's canvas tabs — same lightweight sequential-order
// reassignment as reorderBoards/reorderPDFDocuments above.
export async function reorderCanvases(orderedIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.canvases, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.canvases.update(orderedIds[i], { order: i + 1, updatedAt: now });
    }
  });
}

export async function updateCanvas(
  id: string,
  updates: Partial<Omit<Canvas, "id" | "pageId">>
): Promise<void> {
  await db.canvases.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

// Page.activeCanvasId is the source of truth for which canvas's spillover is
// visible; Canvas.isActive is kept in sync alongside it for consistency.
export async function setActiveCanvas(pageId: string, canvasId: string): Promise<void> {
  const siblings = await db.canvases.where("pageId").equals(pageId).toArray();
  const now = Date.now();

  await db.transaction("rw", db.pages, db.canvases, async () => {
    for (const canvas of siblings) {
      const shouldBeActive = canvas.id === canvasId;
      if (canvas.isActive !== shouldBeActive) {
        await db.canvases.update(canvas.id, { isActive: shouldBeActive, updatedAt: now });
      }
    }
    await db.pages.update(pageId, { activeCanvasId: canvasId, updatedAt: now });
  });
}

// A page must always have at least one canvas (never a null activeCanvasId
// per data-model.md), so the last remaining canvas can't be deleted. If the
// deleted canvas was active, the next-lowest-order sibling becomes active.
export async function deleteCanvas(id: string): Promise<void> {
  const canvas = await db.canvases.get(id);
  if (!canvas) return;

  const siblings = await db.canvases.where("pageId").equals(canvas.pageId).sortBy("order");
  if (siblings.length <= 1) {
    throw new Error("Cannot delete the last remaining canvas on a page");
  }

  const page = await db.pages.get(canvas.pageId);
  const wasActive = page?.activeCanvasId === id;
  const remaining = siblings.filter((c) => c.id !== id);
  const nextActiveId = wasActive ? remaining[0].id : (page?.activeCanvasId ?? remaining[0].id);
  const now = Date.now();

  await db.transaction("rw", db.canvases, db.pages, async () => {
    await db.canvases.delete(id);
    if (wasActive) {
      for (const sibling of remaining) {
        await db.canvases.update(sibling.id, {
          isActive: sibling.id === nextActiveId,
          updatedAt: now,
        });
      }
      await db.pages.update(canvas.pageId, { activeCanvasId: nextActiveId, updatedAt: now });
    }
  });

  await deleteTldrawData(`canvas-${id}`);
}

// One-time manual cleanup utility — not run automatically on app load. Per
// build-order.md § Single Canvas Migration: pre-migration `canvas-${id}`
// tldraw stores were left in place rather than content-migrated into the
// shared page store, orphaned unless that Canvas row happened to later be
// deleted (which cleans up its own store as a side effect of deleteCanvas
// above). This finds every `canvas-${id}` store with no matching row left
// in the `canvases` table and removes it. Idempotent — safe to run more
// than once; a second run just finds nothing left to do. Returns the
// canvas ids whose stores were removed, for logging/verification.
export async function cleanupOrphanedCanvasStores(): Promise<string[]> {
  if (typeof indexedDB.databases !== "function") {
    throw new Error(
      "indexedDB.databases() isn't available in this browser — can't enumerate stores to clean up."
    );
  }

  const canvasStorePrefix = `${TLDRAW_DB_PREFIX}canvas-`;
  const [databases, liveCanvases] = await Promise.all([indexedDB.databases(), db.canvases.toArray()]);
  const liveCanvasIds = new Set(liveCanvases.map((c) => c.id));

  const removed: string[] = [];
  for (const { name } of databases) {
    if (!name || !name.startsWith(canvasStorePrefix)) continue;
    const canvasId = name.slice(canvasStorePrefix.length);
    if (liveCanvasIds.has(canvasId)) continue; // still a real Canvas — not orphaned
    await deleteTldrawData(`canvas-${canvasId}`);
    removed.push(canvasId);
  }
  return removed;
}

// Name-only search across Notebooks, Boards, and PDFDocuments — deliberately
// not a content search (that would mean digging into tldraw stores per
// board/page, meaningfully harder and out of scope for the Polish
// milestone — see docs/ui-interaction.md § Search). Reasonable for v1's
// data volume: reads each table fully and filters in memory rather than
// building a dedicated search index.
export interface SearchResults {
  notebooks: Notebook[];
  boards: Board[];
  pdfs: PDFDocument[];
}

export async function searchAll(query: string): Promise<SearchResults> {
  const q = query.trim().toLowerCase();
  if (!q) return { notebooks: [], boards: [], pdfs: [] };
  const [notebooks, boards, pdfs] = await Promise.all([
    db.notebooks.toArray(),
    db.boards.toArray(),
    db.pdfDocuments.toArray(),
  ]);
  return {
    // Trashed items are excluded from search — same as every other normal
    // list query (see § Trash above); find them via the Trash view instead.
    notebooks: notebooks.filter((n) => n.deletedAt == null && n.name.toLowerCase().includes(q)),
    boards: boards.filter((b) => b.deletedAt == null && b.name.toLowerCase().includes(q)),
    pdfs: pdfs.filter((p) => p.deletedAt == null && p.name.toLowerCase().includes(q)),
  };
}

// --- Trash view -------------------------------------------------------------
// Flat listing of every soft-deleted Notebook/Board/PDFDocument, regardless
// of whether a listed Board/PDFDocument's parent Notebook is itself trashed
// (deliberately not deduplicated/nested — see data-model.md § Trash for why:
// simplicity over a parent/child-aware tree view for v1). Each item is
// restored or permanently deleted independently by the Trash UI.
export interface TrashedItems {
  notebooks: Notebook[];
  boards: Board[];
  pdfs: PDFDocument[];
}

export async function getTrashedItems(): Promise<TrashedItems> {
  const [notebooks, boards, pdfs] = await Promise.all([
    db.notebooks.filter((n) => n.deletedAt != null).toArray(),
    db.boards.filter((b) => b.deletedAt != null).toArray(),
    db.pdfDocuments.filter((p) => p.deletedAt != null).toArray(),
  ]);
  return { notebooks, boards, pdfs };
}
