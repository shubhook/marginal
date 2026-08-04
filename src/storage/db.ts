import Dexie, { type Table } from "dexie";
import type { Notebook, Board, PDFDocument, Page, Canvas } from "./types";

export class MarginalDB extends Dexie {
  notebooks!: Table<Notebook>;
  boards!: Table<Board>;
  pdfDocuments!: Table<PDFDocument>;
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
  }
}

export const db = new MarginalDB();

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
  await db.transaction("rw", db.notebooks, db.boards, db.pdfDocuments, async () => {
    // Delete all boards in this notebook
    const boards = await db.boards.where("notebookId").equals(id).toArray();
    for (const board of boards) {
      await db.boards.delete(board.id);
    }

    // Delete all PDFs and their pages/canvases in this notebook
    const pdfs = await db.pdfDocuments.where("notebookId").equals(id).toArray();
    for (const pdf of pdfs) {
      await deletePDFDocument(pdf.id);
    }

    // Delete the notebook itself
    await db.notebooks.delete(id);
  });
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
  await db.transaction("rw", db.pdfDocuments, db.pages, db.canvases, async () => {
    // Delete all pages and canvases
    const pages = await db.pages.where("pdfDocumentId").equals(id).toArray();
    for (const page of pages) {
      await deletePage(page.id);
    }

    // Delete the PDF document itself
    await db.pdfDocuments.delete(id);
  });
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
  const canvasId = await createCanvas(id, `Canvas 0`);

  const page: Page = {
    id,
    pdfDocumentId,
    pageNumber,
    width,
    height,
    activeCanvasId: canvasId,
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
  await db.transaction("rw", db.pages, db.canvases, async () => {
    // Delete all canvases for this page
    const canvases = await db.canvases.where("pageId").equals(id).toArray();
    for (const canvas of canvases) {
      await db.canvases.delete(canvas.id);
    }

    // Delete the page itself
    await db.pages.delete(id);
  });
}

// Canvas operations
export async function createCanvas(pageId: string, name: string): Promise<string> {
  const order = (await db.canvases.where("pageId").equals(pageId).count()) + 1;
  const now = Date.now();
  const id = `cv_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const canvas: Canvas = {
    id,
    pageId,
    name,
    order,
    isActive: order === 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.canvases.add(canvas);
  return id;
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

export async function deleteCanvas(id: string): Promise<void> {
  await db.canvases.delete(id);
}
