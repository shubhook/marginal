"use client";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Box, Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { PDFDocument as PDFLib } from "pdf-lib";
import type { Page, PDFDocument } from "@/src/storage/types";
import { ensurePageBackground } from "./PDFViewer";
import { getVisibleShapeIds } from "./export";

const EXPORT_PIXEL_RATIO = 2;

// Renders a single Page (background + its currently-active canvas's visible
// ink) to a PNG data URL by mounting a throwaway, off-screen tldraw instance
// against that page's real persistenceKey. Relies on the same invariant
// ensurePageBackground's callers already depend on: onMount only fires after
// persisted store data has fully loaded, so shapes and visibility (opacity
// set by applySpilloverVisibility during normal use) are already correct by
// the time we read them here — this function does not re-derive visibility,
// it reads what's already persisted for whichever canvas was active.
function renderPageToPngDataUrl(page: Page, pdfDocumentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed; left:-99999px; top:0; width:800px; height:1000px;";
    document.body.appendChild(container);
    const root = createRoot(container);
    const cleanup = () => {
      root.unmount();
      container.remove();
    };

    const handleMount = async (editor: Editor) => {
      try {
        await ensurePageBackground(editor, page, pdfDocumentId);
        const ids = getVisibleShapeIds(editor);
        const result = await editor.toImageDataUrl(ids, {
          format: "png",
          pixelRatio: EXPORT_PIXEL_RATIO,
          bounds: new Box(0, 0, page.width, page.height),
          padding: 0,
          background: true,
        });
        cleanup();
        resolve(result.url);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    root.render(
      createElement(Tldraw, {
        persistenceKey: `page-${page.id}`,
        hideUi: true,
        onMount: (editor: Editor) => void handleMount(editor),
      })
    );
  });
}

// Reassembles every page of a PDFDocument into one downloadable PDF, each
// page baked with its currently-active canvas's visible ink — entirely
// client-side (pdf-lib), no server round-trip, per the local-first
// constraint in AGENTS.md § 1.
export async function exportPDFDocument(
  pdfDocument: PDFDocument,
  pages: Page[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const pdfLibDoc = await PDFLib.create();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const dataUrl = await renderPageToPngDataUrl(page, pdfDocument.id);
    const pngImage = await pdfLibDoc.embedPng(dataUrl);
    const pdfPage = pdfLibDoc.addPage([page.width, page.height]);
    pdfPage.drawImage(pngImage, { x: 0, y: 0, width: page.width, height: page.height });
    onProgress?.(i + 1, pages.length);
  }
  const bytes = await pdfLibDoc.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pdfDocument.name}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
