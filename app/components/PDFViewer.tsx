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
import { applySpilloverVisibility, removeSpilloverForCanvas } from "./spillover";
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

type CameraSnapshot = { x: number; y: number; z: number };

// Owns everything scoped to a single page: the single shared tldraw
// instance (direct markup + every linked canvas's shapes, tag-based — see
// docs/build-order.md § Single Canvas Migration), the header row (page nav
// + canvas tabs), and which canvas is currently active (source of truth:
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
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [activeCanvasId, setActiveCanvasIdState] = useState<string | null>(page.activeCanvasId);

  // The beforeCreate shape hook (registered once per editor, below) needs
  // to read whichever canvas is active *at the moment a shape is created*,
  // not whatever was active when the hook was registered — a plain ref
  // updated every render (cheap) is the standard way to give a
  // long-lived closure a live value without re-registering it constantly.
  const activeCanvasIdRef = useRef(activeCanvasId);
  activeCanvasIdRef.current = activeCanvasId;

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

  // Keep the page showing only the active canvas's tagged shapes, whenever
  // either the editor becomes available or the active canvas changes.
  // Clearing selection first avoids a stale selection outline/style-panel
  // reading on a shape that just became hidden on the outgoing canvas.
  useEffect(() => {
    if (!pageEditor) return;
    pageEditor.selectNone();
    applySpilloverVisibility(pageEditor, activeCanvasId);
  }, [pageEditor, activeCanvasId]);

  // Auto-tag every newly-created shape with the currently-active canvas —
  // callers never need to set meta.canvasId manually. A shape that already
  // carries an explicit `canvasId` (the PDF background's reserved `null`
  // sentinel, or a pasted/duplicated shape preserving its original tag) is
  // left alone. Registered once per editor instance; unregistered on
  // unmount/editor change via the returned callback.
  useEffect(() => {
    if (!pageEditor) return;
    return pageEditor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
      if (shape.meta && "canvasId" in shape.meta) return shape;
      return { ...shape, meta: { ...shape.meta, canvasId: activeCanvasIdRef.current } };
    });
  }, [pageEditor]);

  // Persists the outgoing canvas's current camera position (both locally,
  // optimistically, and to Dexie) so it can be restored the next time that
  // canvas becomes active — see data-model.md § Canvas. No-op if there's no
  // editor yet or no previous canvas to save (e.g. first canvas ever).
  const savePreviousCanvasCamera = (prevCanvasId: string | null) => {
    if (!pageEditor || !prevCanvasId) return;
    const camera = pageEditor.getCamera();
    const snapshot: CameraSnapshot = { x: camera.x, y: camera.y, z: camera.z };
    setCanvases((cs) =>
      cs.map((c) => (c.id === prevCanvasId ? { ...c, lastCameraPosition: snapshot } : c))
    );
    updateCanvas(prevCanvasId, { lastCameraPosition: snapshot }).catch((error) =>
      console.error("Failed to save canvas camera position:", error)
    );
  };

  // Restores a canvas's saved camera position, if it has one. Null means
  // this canvas has never been active before — leave the camera wherever
  // it currently is, per data-model.md § Canvas.
  const restoreCanvasCamera = (canvasList: Canvas[], canvasId: string | null) => {
    if (!pageEditor || !canvasId) return;
    const target = canvasList.find((c) => c.id === canvasId);
    if (target?.lastCameraPosition) {
      pageEditor.setCamera(target.lastCameraPosition);
    }
  };

  const handleActivate = (canvasId: string) => {
    if (canvasId === activeCanvasId) return;
    savePreviousCanvasCamera(activeCanvasId);
    setActiveCanvasIdState(canvasId);
    restoreCanvasCamera(canvases, canvasId);
    setActiveCanvas(page.id, canvasId).catch((error) =>
      console.error("Failed to set active canvas:", error)
    );
  };

  const handleCreate = async () => {
    try {
      savePreviousCanvasCamera(activeCanvasId);
      const canvas = await createCanvasAndActivate(page.id, `Canvas ${canvases.length}`);
      setCanvases((cs) => [...cs, canvas]);
      setActiveCanvasIdState(canvas.id);
      // canvas.lastCameraPosition is null (brand new) — leave camera as-is.
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
      const nextActiveId = refreshedPage?.activeCanvasId ?? refreshedCanvases[0]?.id ?? null;
      setActiveCanvasIdState(nextActiveId);
      restoreCanvasCamera(refreshedCanvases, nextActiveId);
    } catch (error) {
      console.error("Failed to delete canvas:", error);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Header row: PDF page nav (left) + canvas tabs (right), single row —
          no divider to align with anymore, since there's only one panel.
          See ui-interaction.md § PDF Page View for the layout decision. */}
      <div className="flex items-center h-11 px-2 border-b border-[#2a2a2a] shrink-0">
        <div className="flex items-center gap-4">
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
        <div className="flex-1" />
        <CanvasTabBar
          canvases={canvases}
          activeCanvasId={activeCanvasId}
          onActivate={handleActivate}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>

      {/* Single shared tldraw instance: PDF background, direct markup, and
          every linked canvas's shapes (tag-based visibility) — see
          docs/build-order.md § Single Canvas Migration. */}
      <div className="relative flex-1 min-w-0 overflow-hidden bg-[#121212]">
        <PageMarkupEditor page={page} pdfDocumentId={pdfDocumentId} onEditorMount={setPageEditor} />
      </div>
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
}

// Tab bar rendered in PageShell's header row, right-aligned next to the PDF
// page nav. Tabs no longer mount/unmount an editor — clicking one just
// changes activeCanvasId and toggles which tagged shapes are visible in the
// single shared page store (see spillover.ts).
function CanvasTabBar({
  canvases,
  activeCanvasId,
  onActivate,
  onCreate,
  onRename,
  onDelete,
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

      <DeleteConfirmationDialog
        isOpen={deleteConfirmationId !== null}
        title="Delete Canvas"
        message="Delete this canvas and its markup? This cannot be undone."
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

// One tldraw instance per Page, persisted under `page-${pageId}` — the only
// editor for this page, mounted with its own stock UI (no hideUi). Every
// linked Canvas's shapes live here too, tagged with meta.canvasId, shown or
// hidden by PageShell's applySpilloverVisibility effect — see
// docs/build-order.md § Single Canvas Migration.
//
// Coordinate model: the rendered page bitmap is inserted as a locked image
// shape at (0,0) sized to the page's native PDF-point dimensions. PDF-page
// space and tldraw page space are therefore identical — a stroke at tldraw
// (x, y) is at PDF point (x, y) — and the tldraw camera plays the role of the
// Transform from src/canvas/coordinates.ts. Pan/zoom moves page and markup
// together, so markup can never drift relative to the page.
//
// Camera: free pan/zoom, same as Boards (Surface 1) — no lock, no
// constraints. The page is fit-to-view once, the first time its background
// is created (see ensurePageBackground below); after that, tldraw's own
// persisted session state carries the camera across reloads, same as a
// Board. Switching canvas tabs overrides this via explicit setCamera calls
// in PageShell (restoreCanvasCamera), not via any lock here.
function PageMarkupEditor({ page, pdfDocumentId, onEditorMount }: PageMarkupEditorProps) {
  const handleMount = (editor: Editor) => {
    onEditorMount(editor);
    void ensurePageBackground(editor, page, pdfDocumentId);
  };

  return (
    <div className="w-full h-full">
      <Tldraw persistenceKey={`page-${page.id}`} onMount={handleMount} autoFocus />
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
    const bounds = new Box(0, 0, page.width, page.height);
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
          // Reserved sentinel — always visible regardless of active canvas.
          // Explicit so the auto-tag beforeCreate hook (PageShell) leaves it
          // alone instead of tagging it with whichever canvas is active.
          meta: { canvasId: null },
        });
        // Below any markup that might already exist, then lock against
        // selection/erase/move.
        editor.sendToBack([shapeId]);
        editor.updateShape({ id: shapeId, type: "image", isLocked: true });
      },
      { history: "ignore" }
    );
    // First time this page's background is created — fit the whole page in
    // view once. Free camera afterwards (no lock), same as a Board; a later
    // reload restores wherever the user left the camera via tldraw's own
    // persisted session state, not this call.
    editor.zoomToBounds(bounds, { inset: 32 });
  } catch (error) {
    console.error("Failed to render PDF page background:", error);
  }
}
