"use client";

import { useEffect, useRef, useState } from "react";
import {
  AssetRecordType,
  Box,
  Tldraw,
  createShapeId,
  type Editor,
  type TLAssetId,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import type { Canvas, Page } from "@/src/storage/types";
import {
  createCanvasAndActivate,
  deleteCanvas,
  getCanvasesByPage,
  getPage,
  getPagesByPDF,
  setActiveCanvas,
  updateCanvas,
} from "@/src/storage/db";
import { renderPageBitmap } from "@/src/pdf/renderer";
import { addTestSpillover, applySpilloverVisibility, removeSpilloverForCanvas } from "./spillover";
import { RightPanel } from "./RightPanel";

interface PDFViewerProps {
  pdfDocumentId: string;
}

export function PDFViewer({ pdfDocumentId }: PDFViewerProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setPageIndex(0);
    getPagesByPDF(pdfDocumentId)
      .then((loaded) => {
        if (!cancelled) setPages(loaded);
      })
      .catch((error) => {
        console.error("Failed to load PDF pages:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDocumentId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[#8a8a8a] text-xs">Loading...</p>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[#8a8a8a] text-sm">This PDF has no pages</p>
      </div>
    );
  }

  const page = pages[Math.min(pageIndex, pages.length - 1)];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page navigation: single-page view with prev/next */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-b border-[#2a2a2a]">
        <button
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          disabled={pageIndex === 0}
          className="px-2 py-1 text-xs text-[#8a8a8a] hover:text-[#f0f0f0] disabled:opacity-40 disabled:pointer-events-none"
        >
          ‹ Prev
        </button>
        <span className="text-[#8a8a8a] text-xs">
          Page {pageIndex + 1} / {pages.length}
        </span>
        <button
          onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
          disabled={pageIndex === pages.length - 1}
          className="px-2 py-1 text-xs text-[#8a8a8a] hover:text-[#f0f0f0] disabled:opacity-40 disabled:pointer-events-none"
        >
          Next ›
        </button>
      </div>

      {/* key forces a fresh page shell per page — each page is its own store,
          with its own set of linked canvases */}
      <PageShell key={page.id} page={page} pdfDocumentId={pdfDocumentId} />
    </div>
  );
}

interface PageShellProps {
  page: Page;
  pdfDocumentId: string;
}

const MIN_PAGE_PANEL_WIDTH = 360;
const MIN_RIGHT_PANEL_WIDTH = 260;
const DEFAULT_RIGHT_PANEL_WIDTH = 340;
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "marginal:rightPanelWidth";

// Owns everything scoped to a single page: the direct-markup tldraw
// instance, the corner button, the linked-canvas right panel, the
// resizable split between them, and which canvas is currently active
// (source of truth: Page.activeCanvasId).
function PageShell({ page, pdfDocumentId }: PageShellProps) {
  const [pageEditor, setPageEditor] = useState<Editor | null>(null);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [activeCanvasId, setActiveCanvasIdState] = useState<string | null>(page.activeCanvasId);
  const [panelOpen, setPanelOpen] = useState(false);

  // Which mounted tldraw instance most recently had pointer activity — only
  // that one shows its default toolbar/style panel, so two tldraw mounts
  // never show two toolbars at once. This is also the mechanism cross-layer
  // drawing (next milestone) will read to know which panel a drag started
  // in, so it isn't a one-off UI patch — see architecture.md.
  const [activePanel, setActivePanel] = useState<"page" | "canvas">("page");

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const rightPanelWidthRef = useRef(rightPanelWidth);
  const [isResizingSplit, setIsResizingSplit] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (!Number.isNaN(parsed)) {
      setRightPanelWidth(parsed);
      rightPanelWidthRef.current = parsed;
    }
  }, []);

  useEffect(() => {
    if (!isResizingSplit) return;

    const handlePointerMove = (e: PointerEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const widthFromCursor = rect.right - e.clientX;
      const maxWidth = Math.max(
        MIN_RIGHT_PANEL_WIDTH,
        rect.width - MIN_PAGE_PANEL_WIDTH
      );
      const clamped = Math.min(maxWidth, Math.max(MIN_RIGHT_PANEL_WIDTH, widthFromCursor));
      rightPanelWidthRef.current = clamped;
      setRightPanelWidth(clamped);
    };

    const handlePointerUp = () => {
      setIsResizingSplit(false);
      window.localStorage.setItem(
        RIGHT_PANEL_WIDTH_STORAGE_KEY,
        String(rightPanelWidthRef.current)
      );
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSplit]);

  useEffect(() => {
    let cancelled = false;
    getCanvasesByPage(page.id)
      .then((loaded) => {
        if (!cancelled) setCanvases(loaded);
      })
      .catch((error) => console.error("Failed to load canvases:", error));
    return () => {
      cancelled = true;
    };
  }, [page.id]);

  // Keep the page's markup layer showing only the active canvas's spillover,
  // whenever either the editor becomes available or the active canvas changes.
  useEffect(() => {
    if (!pageEditor) return;
    applySpilloverVisibility(pageEditor, activeCanvasId);
  }, [pageEditor, activeCanvasId]);

  const handleActivate = async (canvasId: string) => {
    setActiveCanvasIdState(canvasId);
    try {
      await setActiveCanvas(page.id, canvasId);
    } catch (error) {
      console.error("Failed to set active canvas:", error);
    }
  };

  const handleCreate = async () => {
    try {
      const canvas = await createCanvasAndActivate(page.id, `Canvas ${canvases.length}`);
      setCanvases((cs) => [...cs, canvas]);
      setActiveCanvasIdState(canvas.id);
    } catch (error) {
      console.error("Failed to create canvas:", error);
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      await updateCanvas(id, { name });
      setCanvases((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
    } catch (error) {
      console.error("Failed to rename canvas:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (canvases.length <= 1) return; // last canvas on a page can't be removed
    try {
      if (pageEditor) removeSpilloverForCanvas(pageEditor, id);
      await deleteCanvas(id);
      const [refreshedCanvases, refreshedPage] = await Promise.all([
        getCanvasesByPage(page.id),
        getPage(page.id),
      ]);
      setCanvases(refreshedCanvases);
      setActiveCanvasIdState(refreshedPage?.activeCanvasId ?? refreshedCanvases[0]?.id ?? null);
    } catch (error) {
      console.error("Failed to delete canvas:", error);
    }
  };

  const handleAddTestSpillover = () => {
    if (!pageEditor || !activeCanvasId) return;
    const index = canvases.findIndex((c) => c.id === activeCanvasId);
    const canvas = canvases[index];
    if (!canvas) return;
    addTestSpillover(pageEditor, activeCanvasId, canvas.name, index);
  };

  return (
    <div ref={splitContainerRef} className="flex-1 flex overflow-hidden p-2 gap-0">
      <div
        className="relative flex-1 min-w-0 border border-[#2a2a2a] rounded-md overflow-hidden bg-[#121212]"
        style={{ minWidth: MIN_PAGE_PANEL_WIDTH }}
        onPointerDownCapture={() => setActivePanel("page")}
      >
        <PageMarkupEditor
          page={page}
          pdfDocumentId={pdfDocumentId}
          onEditorMount={setPageEditor}
          hideUi={panelOpen && activePanel !== "page"}
        />
        <button
          onClick={() => setPanelOpen((open) => !open)}
          // tldraw's own UI (style panel, menus) uses z-index up to 300 — this
          // has to sit above it to stay clickable regardless of tool state.
          className="absolute top-3 right-3 z-[400] w-7 h-7 flex items-center justify-center rounded border border-[#2a2a2a] bg-[#1c1c1e] text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#242424] text-xs shadow-md"
          title="Linked canvases"
        >
          ⧉
        </button>
      </div>

      {panelOpen && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => {
              e.preventDefault();
              setIsResizingSplit(true);
            }}
            className={`w-2 shrink-0 mx-1 cursor-col-resize rounded-full transition-colors ${
              isResizingSplit ? "bg-[#3a3a3a]" : "bg-transparent hover:bg-[#2a2a2a]"
            }`}
            title="Drag to resize"
          />
          <div
            className="shrink-0 border border-[#2a2a2a] rounded-md overflow-hidden"
            style={{ width: rightPanelWidth }}
            onPointerDownCapture={() => setActivePanel("canvas")}
          >
            <RightPanel
              canvases={canvases}
              activeCanvasId={activeCanvasId}
              onActivate={handleActivate}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              onClose={() => setPanelOpen(false)}
              onAddTestSpillover={handleAddTestSpillover}
              hideUi={activePanel !== "canvas"}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface PageMarkupEditorProps {
  page: Page;
  pdfDocumentId: string;
  onEditorMount: (editor: Editor) => void;
  hideUi: boolean;
}

// One tldraw instance per Page, persisted under `page-${pageId}`.
//
// Coordinate model: the rendered page bitmap is inserted as a locked image
// shape at (0,0) sized to the page's native PDF-point dimensions. PDF-page
// space and tldraw page space are therefore identical — a stroke at tldraw
// (x, y) is at PDF point (x, y) — and the tldraw camera plays the role of the
// Transform from src/canvas/coordinates.ts. Pan/zoom moves page and markup
// together, so markup can never drift relative to the page.
//
// Spillover shapes (Surface 3) also live in this same store, tagged with
// `meta.canvasId` — see app/components/spillover.ts.
function PageMarkupEditor({ page, pdfDocumentId, onEditorMount, hideUi }: PageMarkupEditorProps) {
  const handleMount = (editor: Editor) => {
    // Frame the page immediately — dimensions are known from the Page row.
    editor.zoomToBounds(new Box(0, 0, page.width, page.height), {
      inset: 32,
    });
    onEditorMount(editor);
    void ensurePageBackground(editor, page, pdfDocumentId);
  };

  return (
    <div className="w-full h-full">
      <Tldraw
        persistenceKey={`page-${page.id}`}
        onMount={handleMount}
        autoFocus
        hideUi={hideUi}
      />
    </div>
  );
}

async function ensurePageBackground(
  editor: Editor,
  page: Page,
  pdfDocumentId: string
) {
  const shapeId: TLShapeId = createShapeId(`pdfbg-${page.id}`);
  if (editor.getShape(shapeId)) return; // persisted from a previous visit

  try {
    const bitmap = await renderPageBitmap(pdfDocumentId, page.id, page.pageNumber);
    // Re-check after the await — the store may have loaded it meanwhile, or
    // the component may have unmounted.
    if (editor.isDisposed || editor.getShape(shapeId)) return;

    const assetId: TLAssetId = AssetRecordType.createId(`pdfbg-${page.id}`);
    editor.run(
      () => {
        editor.createAssets([
          {
            id: assetId,
            typeName: "asset",
            type: "image",
            props: {
              src: bitmap.dataUrl,
              w: bitmap.pixelWidth,
              h: bitmap.pixelHeight,
              name: `page-${page.pageNumber + 1}`,
              isAnimated: false,
              mimeType: "image/png",
            },
            meta: {},
          },
        ]);
        editor.createShape({
          id: shapeId,
          type: "image",
          x: 0,
          y: 0,
          props: { assetId, w: page.width, h: page.height },
        });
        // Below any markup that might already exist, then lock against
        // selection/erase/move.
        editor.sendToBack([shapeId]);
        editor.updateShape({ id: shapeId, type: "image", isLocked: true });
      },
      { history: "ignore" }
    );
  } catch (error) {
    console.error("Failed to render PDF page background:", error);
  }
}
