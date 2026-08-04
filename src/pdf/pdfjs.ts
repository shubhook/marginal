// Central PDF.js entry point. Always obtain pdfjs via getPdfjs(), never by
// importing "pdfjs-dist" directly: the library touches browser globals
// (DOMMatrix etc.) at module scope, so a static import breaks Next's SSR pass
// even inside "use client" components. Dynamic import defers evaluation to
// the browser, and the worker is configured exactly once here.
import type * as PdfjsModule from "pdfjs-dist";

export type Pdfjs = typeof PdfjsModule;
export type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<Pdfjs> | null = null;

export function getPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}
