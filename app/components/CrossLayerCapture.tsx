"use client";

import { useValue } from "@tldraw/state-react";
import { useRef, useState, type RefObject } from "react";
import type { Editor } from "tldraw";
import {
  createLineShapeFromScreenPoints,
  getCurrentLineStyle,
  makeStrokeGroupId,
  splitPointsAtDivider,
  type ScreenPoint,
} from "./crossLayerDrawing";

interface CrossLayerCaptureProps {
  pageEditor: Editor | null;
  canvasEditor: Editor | null;
  activeCanvasId: string | null;
  activeEditorRef: RefObject<Editor | null>;
  activeEditorVersion: number;
  // Body-row layout, same values PageShell uses to size the panels
  // themselves — the capture strip is positioned from these directly
  // (no DOM measurement) so it always lines up with the real divider,
  // including while dragging it.
  rightPanelWidth: number;
  splitContainerRef: RefObject<HTMLDivElement | null>;
  onActivatePanel: (panel: "page" | "canvas") => void;
}

// How close to the divider a drag has to *start* to be treated as
// "crossing or about to cross" (see architecture.md § Cross-Layer Drawing).
// Drags starting further away never touch this component — pointer-events
// stays off there, so they hit the panel's own tldraw canvas directly, at
// zero overhead, same as any other draw-tool stroke.
const CAPTURE_ZONE_WIDTH = 96;
// Matches the body row's own p-2 (8px) padding + the divider's mx-1 (4px)
// half-footprint, both in PDFViewer.tsx — see the `right:` calc below.
const DIVIDER_OFFSET_FROM_PANEL = 16;

// Transparent strip straddling the panel divider. Only intercepts pointer
// events when the active editor's current tool is the pen ("draw") — any
// other tool (select, shapes, etc.) passes straight through to whichever
// panel is underneath, unaffected.
//
// On a captured drag, screen points are buffered as the pointer moves
// (`setPointerCapture` keeps delivering them even once the cursor leaves
// this strip's own bounds) and rendered live as a single screen-space SVG
// polyline spanning both panels, so the stroke looks continuous with no
// seam at the boundary regardless of either panel's zoom/pan. On release,
// the buffered points are split at the divider and converted into up to two
// `line` shapes (crossLayerDrawing.ts) — one per side that has ≥2 points,
// sharing a strokeGroupId when both sides do.
export function CrossLayerCapture({
  pageEditor,
  canvasEditor,
  activeCanvasId,
  activeEditorRef,
  activeEditorVersion,
  rightPanelWidth,
  splitContainerRef,
  onActivatePanel,
}: CrossLayerCaptureProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewPoints, setPreviewPoints] = useState<ScreenPoint[]>([]);
  const pointsRef = useRef<ScreenPoint[]>([]);
  const originPanelRef = useRef<"page" | "canvas">("page");
  // React state updates are batched/async — a guard read from `isDragging`
  // (state) inside a rapid-fire pointermove handler can see a stale value if
  // pointerdown → pointermove happen close enough together that the state
  // update hasn't committed yet, silently dropping the earliest move points.
  // This ref is the source of truth for the guard; `isDragging` state is
  // kept only to drive the SVG preview's conditional render.
  const isDraggingRef = useRef(false);

  const currentToolId = useValue(
    "cross-layer-capture-tool",
    () => activeEditorRef.current?.getCurrentToolId() ?? null,
    [activeEditorRef, activeEditorVersion]
  );

  const getDividerX = (): number | null => {
    const rect = splitContainerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return rect.right - DIVIDER_OFFSET_FROM_PANEL - rightPanelWidth;
  };

  const handlePointerEnter = (e: React.PointerEvent) => {
    if (isDraggingRef.current) return;
    const dividerX = getDividerX();
    if (dividerX === null) return;
    onActivatePanel(e.clientX < dividerX ? "page" : "canvas");
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const dividerX = getDividerX();
    if (dividerX === null) return;
    originPanelRef.current = e.clientX < dividerX ? "page" : "canvas";
    e.preventDefault();
    // Pointer capture can fail if the browser doesn't consider this pointer
    // "active" (e.g. certain synthetic/automated input) — that's fine, the
    // buffering/splitting logic below doesn't depend on it succeeding, it
    // just means fast pointer movement outside the strip's own bounds could
    // in principle stop reaching us. Not fatal either way.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingRef.current = true;
    pointsRef.current = [{ x: e.clientX, y: e.clientY }];
    setPreviewPoints(pointsRef.current);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    pointsRef.current = [...pointsRef.current, { x: e.clientX, y: e.clientY }];
    setPreviewPoints(pointsRef.current);
  };

  const finishDrag = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(false);

    // Always include the release position itself — a very fast or
    // coarsely-sampled drag (few/no intermediate pointermove events) should
    // still produce a two-point line rather than silently no-op.
    const points = [...pointsRef.current, { x: e.clientX, y: e.clientY }];
    pointsRef.current = [];
    setPreviewPoints([]);
    if (!pageEditor || !canvasEditor) return;

    const dividerX = getDividerX();
    if (dividerX === null) return;
    const { left: pdfPoints, right: canvasPoints } = splitPointsAtDivider(points, dividerX);

    const hasPdfSide = pdfPoints.length >= 2;
    const hasCanvasSide = canvasPoints.length >= 2;

    // Captured once from wherever the drag started, so both halves of a
    // cross-boundary stroke share one consistent color/dash/size instead of
    // each picking up whatever's currently selected in its own panel.
    const style = getCurrentLineStyle(
      originPanelRef.current === "page" ? pageEditor : canvasEditor
    );

    if (hasPdfSide && hasCanvasSide) {
      // Genuine cross-boundary stroke: two linked segments, sharing a
      // strokeGroupId, in their respective coordinate spaces. The PDF-side
      // segment is tagged with the drawing-time active canvas, so it obeys
      // the same spillover visibility rule as any other canvas-tagged shape
      // (spillover.ts) — switching canvases later shows/hides it correctly.
      const strokeGroupId = makeStrokeGroupId();
      createLineShapeFromScreenPoints(pageEditor, pdfPoints, style, {
        canvasId: activeCanvasId,
        strokeGroupId,
      });
      createLineShapeFromScreenPoints(canvasEditor, canvasPoints, style, { strokeGroupId });
    } else if (hasPdfSide) {
      // Never actually crossed — stayed on the PDF side. Plain direct markup.
      createLineShapeFromScreenPoints(pageEditor, pdfPoints, style);
    } else if (hasCanvasSide) {
      // Never actually crossed — stayed on the canvas side. Plain stroke.
      createLineShapeFromScreenPoints(canvasEditor, canvasPoints, style);
    }
  };

  if (currentToolId !== "draw" || !pageEditor || !canvasEditor) {
    return null;
  }

  return (
    <>
      <div
        onPointerEnter={handlePointerEnter}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className="absolute top-0 bottom-0 z-[450] cursor-crosshair"
        style={{
          right: `calc(${rightPanelWidth}px + ${DIVIDER_OFFSET_FROM_PANEL}px - ${CAPTURE_ZONE_WIDTH / 2}px)`,
          width: CAPTURE_ZONE_WIDTH,
        }}
        title="Draw across the boundary to link a stroke between the PDF page and this canvas"
      />
      {isDragging && previewPoints.length > 1 && (
        <svg className="fixed inset-0 z-[600] pointer-events-none" width="100vw" height="100vh">
          <polyline
            points={previewPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#f0f0f0"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );
}
