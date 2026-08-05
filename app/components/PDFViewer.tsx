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
import { FloatingTldrawUi } from "./FloatingTldrawUi";
import { CrossLayerCapture } from "./CrossLayerCapture";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

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
    <PageShell
      key={page.id}
      page={page}
      pdfDocumentId={pdfDocumentId}
      pageIndex={pageIndex}
      totalPages={pages.length}
      onPrevPage={() => setPageIndex((i) => Math.max(0, i - 1))}
      onNextPage={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
    />
  );
}

interface PageShellProps {
  page: Page;
  pdfDocumentId: string;
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

const MIN_PAGE_PANEL_WIDTH = 360;
const MIN_RIGHT_PANEL_WIDTH = 260;
const DEFAULT_RIGHT_PANEL_WIDTH = 340;
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "marginal:rightPanelWidth";
// Matches the divider's own footprint in the body row (mx-1 + w-2 + mx-1),
// so the header row's spacer lines up exactly with it.
const SPLIT_GAP_PX = 16;

// Owns everything scoped to a single page: the direct-markup tldraw
// instance, the corner button, the linked-canvas right panel, the
// resizable split between them, the unified header row (page nav + canvas
// tabs), and which canvas is currently active (source of truth:
// Page.activeCanvasId).
function PageShell({
  page,
  pdfDocumentId,
  pageIndex,
  totalPages,
  onPrevPage,
  onNextPage,
}: PageShellProps) {
  const [pageEditor, setPageEditor] = useState<Editor | null>(null);
  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [activeCanvasId, setActiveCanvasIdState] = useState<string | null>(page.activeCanvasId);
  const [panelOpen, setPanelOpen] = useState(false);

  // Which panel the pointer is currently over — 'page' by default. Drives
  // which editor the shared Capsule (see below) routes actions to. This is
  // also the signal cross-layer drawing (next milestone) will read to know
  // which panel a drag started in — see architecture.md.
  const [activePanel, setActivePanel] = useState<"page" | "canvas">("page");
  const activeEditorRef = useRef<Editor | null>(null);
  const [activeEditorVersion, setActiveEditorVersion] = useState(0);

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

  // Re-point the Capsule's target whenever the hovered panel changes, or
  // whenever that panel's editor instance changes underneath it (e.g. the
  // canvas panel remounts a new tldraw instance on tab switch while the
  // pointer is still over it).
  useEffect(() => {
    const next = activePanel === "page" ? pageEditor : canvasEditor;
    if (next && activeEditorRef.current !== next) {
      activeEditorRef.current = next;
      setActiveEditorVersion((v) => v + 1);
    }
  }, [activePanel, pageEditor, canvasEditor]);

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
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Unified header row: PDF page nav (left) + canvas tabs (right),
          same row, same height, split at the same point as the divider
          in the body row below. */}
      <div className="flex items-stretch h-11 px-2 border-b border-[#2a2a2a] shrink-0">
        <div
          className="flex-1 min-w-0 flex items-center justify-center gap-4"
          style={{ minWidth: MIN_PAGE_PANEL_WIDTH }}
        >
          <button
            onClick={onPrevPage}
            disabled={pageIndex === 0}
            className="px-2 py-1 text-xs text-[#8a8a8a] hover:text-[#f0f0f0] disabled:opacity-40 disabled:pointer-events-none"
          >
            ‹ Prev
          </button>
          <span className="text-[#8a8a8a] text-xs">
            Page {pageIndex + 1} / {totalPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={pageIndex === totalPages - 1}
            className="px-2 py-1 text-xs text-[#8a8a8a] hover:text-[#f0f0f0] disabled:opacity-40 disabled:pointer-events-none"
          >
            Next ›
          </button>
        </div>
        {panelOpen && (
          <>
            <div style={{ width: SPLIT_GAP_PX }} className="shrink-0" />
            <div className="shrink-0" style={{ width: rightPanelWidth }}>
              <CanvasTabBar
                canvases={canvases}
                activeCanvasId={activeCanvasId}
                onActivate={handleActivate}
                onCreate={handleCreate}
                onRename={handleRename}
                onDelete={handleDelete}
                onClose={() => setPanelOpen(false)}
                onAddTestSpillover={handleAddTestSpillover}
              />
            </div>
          </>
        )}
      </div>

      {/* Body row: PDF panel | divider | canvas panel */}
      <div ref={splitContainerRef} className="relative flex-1 flex overflow-hidden p-2 gap-0">
        <div
          className="relative flex-1 min-w-0 border border-[#2a2a2a] rounded-md overflow-hidden bg-[#121212]"
          style={{ minWidth: MIN_PAGE_PANEL_WIDTH }}
          onPointerEnter={() => setActivePanel("page")}
        >
          <PageMarkupEditor
            page={page}
            pdfDocumentId={pdfDocumentId}
            onEditorMount={setPageEditor}
          />
          <button
            onClick={() => setPanelOpen((open) => !open)}
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
              onPointerEnter={() => setActivePanel("canvas")}
            >
              <RightPanel activeCanvasId={activeCanvasId} onEditorMount={setCanvasEditor} />
            </div>
            <CrossLayerCapture
              pageEditor={pageEditor}
              canvasEditor={canvasEditor}
              activeCanvasId={activeCanvasId}
              activeEditorRef={activeEditorRef}
              activeEditorVersion={activeEditorVersion}
              rightPanelWidth={rightPanelWidth}
              splitContainerRef={splitContainerRef}
              onActivatePanel={setActivePanel}
            />
          </>
        )}
      </div>

      {/* tldraw's own toolbar + style panel, floating over both panels and
          bound to whichever one the pointer last entered — see
          FloatingTldrawUi.tsx. Both underlying Tldraw instances mount with
          hideUi; this is the only chrome on screen. */}
      <FloatingTldrawUi activeEditorRef={activeEditorRef} version={activeEditorVersion} />
    </div>
  );
}

interface CanvasTabBarProps {
  canvases: Canvas[];
  activeCanvasId: string | null;
  onActivate: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAddTestSpillover: () => void;
}

// Tab bar for the linked-canvas panel, rendered in PageShell's unified
// header row (aligned with the PDF page nav on the left).
function CanvasTabBar({
  canvases,
  activeCanvasId,
  onActivate,
  onCreate,
  onRename,
  onDelete,
  onClose,
  onAddTestSpillover,
}: CanvasTabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  const startEdit = (canvas: Canvas) => {
    setEditingId(canvas.id);
    setEditingName(canvas.name);
  };

  const saveEdit = (id: string) => {
    if (editingName.trim()) onRename(id, editingName.trim());
    setEditingId(null);
  };

  return (
    <div className="h-full flex items-center overflow-x-auto">
      {canvases.map((canvas) => {
        const isActive = canvas.id === activeCanvasId;
        return (
          <div
            key={canvas.id}
            className={`group relative shrink-0 h-full flex items-center border-b-2 ${
              isActive ? "border-[#f0f0f0]" : "border-transparent"
            }`}
          >
            {editingId === canvas.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(canvas.id);
                  else if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => saveEdit(canvas.id)}
                className="w-24 px-2 py-1 bg-black text-[#f0f0f0] text-xs outline-none"
                autoFocus
              />
            ) : (
              <button
                onClick={() => onActivate(canvas.id)}
                onDoubleClick={() => startEdit(canvas)}
                className={`px-3 text-xs truncate max-w-[7rem] ${
                  isActive ? "text-[#f0f0f0]" : "text-[#8a8a8a] hover:text-[#f0f0f0]"
                }`}
                title={canvas.name}
              >
                {canvas.name}
              </button>
            )}
            {canvases.length > 1 && editingId !== canvas.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmationId(canvas.id);
                }}
                className="hidden group-hover:block absolute top-1 right-0.5 text-[#8a8a8a] hover:text-red-500 text-[10px]"
                title="Delete canvas"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={onCreate}
        className="shrink-0 px-3 text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
        title="New canvas"
      >
        +
      </button>
      <div className="flex-1" />
      <button
        onClick={onAddTestSpillover}
        className="shrink-0 px-2 text-[#8a8a8a] hover:text-[#f0f0f0] text-[10px]"
        title="Temporary test affordance (Surface 3 verification) — marks the page with this canvas's spillover. Real cross-layer drawing is next milestone."
      >
        ⊕ spill
      </button>
      <button
        onClick={onClose}
        className="shrink-0 px-2 text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
        title="Close panel"
      >
        ✕
      </button>

      <DeleteConfirmationDialog
        isOpen={deleteConfirmationId !== null}
        title="Delete Canvas"
        message="Delete this linked canvas and its spillover on the page? This cannot be undone."
        onConfirm={() => {
          if (deleteConfirmationId) onDelete(deleteConfirmationId);
          setDeleteConfirmationId(null);
        }}
        onCancel={() => setDeleteConfirmationId(null)}
        isDangerous
      />
    </div>
  );
}

interface PageMarkupEditorProps {
  page: Page;
  pdfDocumentId: string;
  onEditorMount: (editor: Editor) => void;
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
// Camera lock: the PDF panel is a fixed viewer panel, not a second infinite
// canvas — after the initial fit, user-driven pan/zoom (drag, wheel, pinch,
// keyboard) is disabled via tldraw's camera-options API (isLocked + a
// `fit-min` constraint, i.e. letterboxed containment: the page's full extent
// always stays visible, whichever axis is the tighter fit). Drawing/markup
// interaction is unaffected — only camera movement is locked. See
// architecture.md for the full rationale.
//
// Spillover shapes (Surface 3) also live in this same store, tagged with
// `meta.canvasId` — see app/components/spillover.ts.
//
// Always mounts with hideUi — the shared Capsule is the only toolbar.
function PageMarkupEditor({ page, pdfDocumentId, onEditorMount }: PageMarkupEditorProps) {
  const handleMount = (editor: Editor) => {
    const bounds = new Box(0, 0, page.width, page.height);
    editor.setCameraOptions({
      isLocked: true,
      wheelBehavior: "none",
      constraints: {
        bounds,
        padding: { x: 32, y: 32 },
        origin: { x: 0.5, y: 0.5 },
        initialZoom: "fit-min",
        baseZoom: "fit-min",
        behavior: "fixed",
      },
    });
    // Camera is now locked — force the initial fit through explicitly so it
    // matches the constraints above exactly.
    editor.zoomToBounds(bounds, { inset: 32, force: true });
    onEditorMount(editor);
    void ensurePageBackground(editor, page, pdfDocumentId);
  };

  return (
    <div className="w-full h-full">
      <Tldraw persistenceKey={`page-${page.id}`} onMount={handleMount} autoFocus hideUi />
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
