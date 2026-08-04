// Imports a PDF file into a notebook: one PDFDocument row, the raw bytes,
// and one Page row per source page with dimensions read from that page.
import type { PDFDocument } from "@/src/storage/types";
import {
  createPDFDocument,
  createPage,
  deletePDFDocument,
  savePDFFile,
} from "@/src/storage/db";
import { getPdfjs } from "./pdfjs";

export async function importPdfFile(
  notebookId: string,
  file: File
): Promise<PDFDocument> {
  const pdfjs = await getPdfjs();
  const bytes = await file.arrayBuffer();
  // PDF.js transfers (detaches) the buffer it's given, so parse a copy and
  // keep the original for storage.
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const parsed = await loadingTask.promise;

  const name = file.name.replace(/\.pdf$/i, "") || file.name;
  const doc = await createPDFDocument(notebookId, name, file.name);

  try {
    await savePDFFile(doc.id, bytes);
    for (let i = 1; i <= parsed.numPages; i++) {
      const page = await parsed.getPage(i);
      // scale 1 → viewport dimensions are the page's native size in PDF points
      const viewport = page.getViewport({ scale: 1 });
      await createPage(doc.id, i - 1, viewport.width, viewport.height);
    }
  } catch (error) {
    // Don't leave a half-imported document behind.
    await deletePDFDocument(doc.id);
    throw error;
  } finally {
    await loadingTask.destroy();
  }

  return doc;
}
