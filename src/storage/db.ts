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
const TLDRAW_DB_PREFIX = "TLDRAW_DOCUMENT_v2";

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
    createdAt: now,
    updatedAt: now,
  };

  await db.notebooks.add(notebook);
  return notebook;
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  return db.notebooks.get(id);
}

export async function getNotebooksList(): Promise<Notebook[]> {
  return db.notebooks.orderBy("order").toArray();
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

export async function deleteNotebook(id: string): Promise<void> {
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
    createdAt: now,
    updatedAt: now,
  };

  await db.boards.add(board);
  return board;
}

export async function getBoard(id: string): Promise<Board | undefined> {
  return db.boards.get(id);
}

export async function getBoardsByNotebook(notebookId: string): Promise<Board[]> {
  return db.boards.where("notebookId").equals(notebookId).sortBy("order");
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

export async function deleteBoard(id: string): Promise<void> {
  await db.boards.delete(id);
  await deleteTldrawData(`board-${id}`);
}

// PDFDocument operations
export async function createPDFDocument(
  notebookId: string,
  name: string,
  fileName: string
): Promise<PDFDocument> {
  const now = Date.now();
  const id = `pdf_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const pdf: PDFDocument = {
    id,
    notebookId,
    name,
    fileName,
    createdAt: now,
    updatedAt: now,
  };

  await db.pdfDocuments.add(pdf);
  return pdf;
}

export async function getPDFDocument(id: string): Promise<PDFDocument | undefined> {
  return db.pdfDocuments.get(id);
}

export async function getPDFsByNotebook(notebookId: string): Promise<PDFDocument[]> {
  return db.pdfDocuments.where("notebookId").equals(notebookId).sortBy("createdAt");
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

export async function deletePDFDocument(id: string): Promise<void> {
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
