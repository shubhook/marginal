export interface Canvas {
  id: string;
  pageId: string;
  name: string;
  order: number;
  isActive: boolean;
  // Strokes and shapes would be stored separately (tldraw's own format)
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
  createdAt: number;
  updatedAt: number;
}

export interface Notebook {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}
