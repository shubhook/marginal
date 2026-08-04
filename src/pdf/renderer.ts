// Renders PDF pages to bitmaps, with caching at both levels:
// - parsed PDFDocumentProxy per pdfDocumentId (parse once per session)
// - rendered page bitmap (data URL) per pageId (render once per session;
//   after the bitmap lands in a page's tldraw store it persists there and
//   this cache isn't even consulted on later visits)
import { getPDFFile } from "@/src/storage/db";
import { getPdfjs, type PDFDocumentProxy } from "./pdfjs";

// Bitmap oversampling vs. PDF points, for crispness when zooming in.
const RENDER_SCALE = 2;
// styling.md §7 — thin outline so page edges read against the canvas.
const PAGE_BORDER_COLOR = "#2a2a2a";

const docCache = new Map<string, Promise<PDFDocumentProxy>>();
const bitmapCache = new Map<string, Promise<RenderedPage>>();

export interface RenderedPage {
  dataUrl: string;
  pixelWidth: number;
  pixelHeight: number;
}

export function getPdfDocument(pdfDocumentId: string): Promise<PDFDocumentProxy> {
  let cached = docCache.get(pdfDocumentId);
  if (!cached) {
    cached = loadDocument(pdfDocumentId);
    docCache.set(pdfDocumentId, cached);
    cached.catch(() => docCache.delete(pdfDocumentId));
  }
  return cached;
}

async function loadDocument(pdfDocumentId: string): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const data = await getPDFFile(pdfDocumentId);
  if (!data) {
    throw new Error(`No stored PDF file for document ${pdfDocumentId}`);
  }
  // Dexie hands back a fresh copy from IndexedDB, so PDF.js detaching the
  // buffer when it transfers it to the worker is fine.
  return pdfjs.getDocument({ data }).promise;
}

export function renderPageBitmap(
  pdfDocumentId: string,
  pageId: string,
  pageNumber: number // 0-indexed, per the Page schema
): Promise<RenderedPage> {
  let cached = bitmapCache.get(pageId);
  if (!cached) {
    cached = render(pdfDocumentId, pageNumber);
    bitmapCache.set(pageId, cached);
    cached.catch(() => bitmapCache.delete(pageId));
  }
  return cached;
}

async function render(
  pdfDocumentId: string,
  pageNumber: number
): Promise<RenderedPage> {
  const doc = await getPdfDocument(pdfDocumentId);
  const page = await doc.getPage(pageNumber + 1); // PDF.js is 1-indexed
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context for PDF render");

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  ctx.strokeStyle = PAGE_BORDER_COLOR;
  ctx.lineWidth = RENDER_SCALE; // 1px at display scale
  ctx.strokeRect(
    RENDER_SCALE / 2,
    RENDER_SCALE / 2,
    canvas.width - RENDER_SCALE,
    canvas.height - RENDER_SCALE
  );

  return {
    dataUrl: canvas.toDataURL("image/png"),
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  };
}
