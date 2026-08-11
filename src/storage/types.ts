export interface Canvas {
  id: string;
  pageId: string;
  name: string;
  order: number;
  isActive: boolean;
  // Camera position (page-store coordinates) to restore when this canvas
  // becomes active again. Null until this canvas has ever been active —
  // see data-model.md § Canvas.
  lastCameraPosition: {
    x: number;
    y: number;
    z: number; // zoom level
  } | null;
  // Strokes and shapes live in the page's single shared tldraw store
  // (page-${pageId}), tagged with meta.canvasId — not stored separately.
  createdAt: number;
  updatedAt: number;
}

export interface Page {
  id: string;
  pdfDocumentId: string;
  pageNumber: number;
  width: number;
  height: number;
  activeCanvasId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PDFDocument {
  id: string;
  notebookId: string;
  name: string;
  fileName: string;
  order: number; // Sort order within notebook (v4 — see data-model.md § Reordering)
  // Soft-delete marker (v4 — see data-model.md § Trash). Null = not deleted.
  // Set by softDeletePDFDocument, cleared by restorePDFDocument. The real
  // cascade-delete only happens via permanentlyDeletePDFDocument.
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// Raw PDF bytes, stored separately from PDFDocument metadata so listing
// PDFs in the sidebar never loads file contents.
export interface PDFFile {
  pdfDocumentId: string;
  data: ArrayBuffer;
}

export interface Board {
  id: string;
  notebookId: string;
  name: string;
  order: number;
  // Soft-delete marker (v4 — see data-model.md § Trash). Null = not deleted.
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Notebook {
  id: string;
  name: string;
  order: number;
  // Soft-delete marker (v4 — see data-model.md § Trash). Null = not deleted.
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
