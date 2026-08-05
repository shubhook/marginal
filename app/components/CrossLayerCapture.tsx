"use client";

import { useValue } from "@tldraw/state-react";
import { useEffect, useRef, useState, type RefObject } from "react";
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
// Once a drag *starts* inside this strip (pointerdown), tracking switches to
// window-level pointermove/pointerup/pointercancel listeners rather than
// relying on the strip element continuing to receive events. This is
// deliberate: a real drag very quickly carries the pointer outside this
// narrow (96px) strip, and `setPointerCapture` on the strip element is not
// reliable enough on its own to guarantee the eventual pointerup still
// reaches it (it can silently fail, and even when it succeeds some input
// paths don't honor it). Without window-level listeners, a drag that ends
// outside the strip never calls finishDrag: `isDragging` gets stuck true,
// and every later pointer movement over the strip keeps appending to the
// same never-cleared point buffer — visible as an ever-growing tangle of
// preview-only scribble that isn't a real shape (can't be erased) and only
// disappears because the whole overlay unmounts when the tool changes away
// from "draw". Window listeners guarantee the drag always reaches a real
// pointerup/pointercancel and finishes cleanly, however far it travels.
//
// While the drag is in progress, the buffered points are rendered live as a
// single screen-space SVG polyline spanning both panels, so the stroke looks
// continuous with no seam at the boundary regardless of either panel's
// zoom/pan. On release, the buffered points are split at the divider and
// converted into up to two `line` shapes (crossLayerDrawing.ts) — one per
// side that has ≥2 points, sharing a strokeGroupId when both sides do.
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
  // Cleanup for whichever window listeners the in-progress drag registered.
  // Stored so it can be called from finishDrag *and* from the unmount
  // effect below (tool switched away mid-drag) without duplicating the
  // removeEventListener calls in two places.
  const cleanupWindowListenersRef = useRef<(() => void) | null>(null);

  // Props captured fresh on every render into refs the window-level
  // listeners read from — the listeners are attached once per drag (in
  // handlePointerDown) but must always see the latest editors/canvas id,
  // not whatever was current at the moment the drag started.
  const pageEditorRef = useRef(pageEditor);
  const canvasEditorRef = useRef(canvasEditor);
  const activeCanvasIdRef = useRef(activeCanvasId);
  pageEditorRef.current = pageEditor;
  canvasEditorRef.current = canvasEditor;
  activeCanvasIdRef.current = activeCanvasId;

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

  // Ends the in-progress drag (real pointerup, or fallback pointercancel):
  // removes the window listeners, resets drag state, and — unless
  // `abandon` is set (component unmounting mid-drag) — splits the buffered
  // points and creates the resulting shape(s).
  const finishDrag = (finalPoint: ScreenPoint, abandon = false) => {
    cleanupWindowListenersRef.current?.();
    cleanupWindowListenersRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);

    // Always include the release position itself — a very fast or
    // coarsely-sampled drag (few/no intermediate pointermove events) should
    // still produce a two-point line rather than silently no-op.
    const points = [...pointsRef.current, finalPoint];
    pointsRef.current = [];
    setPreviewPoints([]);

    if (abandon) return;

    const pageEd = pageEditorRef.current;
    const canvasEd = canvasEditorRef.current;
    if (!pageEd || !canvasEd) return;

    const dividerX = getDividerX();
    if (dividerX === null) return;
    const { left: pdfPoints, right: canvasPoints } = splitPointsAtDivider(points, dividerX);

    const hasPdfSide = pdfPoints.length >= 2;
    const hasCanvasSide = canvasPoints.length >= 2;

    // Captured once from wherever the drag started, so both halves of a
    // cross-boundary stroke share one consistent color/dash/size instead of
    // each picking up whatever's currently selected in its own panel.
    const style = getCurrentLineStyle(originPanelRef.current === "page" ? pageEd : canvasEd);

    if (hasPdfSide && hasCanvasSide) {
      // Genuine cross-boundary stroke: two linked segments, sharing a
      // strokeGroupId, in their respective coordinate spaces. The PDF-side
      // segment is tagged with the drawing-time active canvas, so it obeys
      // the same spillover visibility rule as any other canvas-tagged shape
      // (spillover.ts) — switching canvases later shows/hides it correctly.
      const strokeGroupId = makeStrokeGroupId();
      createLineShapeFromScreenPoints(pageEd, pdfPoints, style, {
        canvasId: activeCanvasIdRef.current,
        strokeGroupId,
      });
      createLineShapeFromScreenPoints(canvasEd, canvasPoints, style, { strokeGroupId });
    } else if (hasPdfSide) {
      // Never actually crossed — stayed on the PDF side. Plain direct markup.
      createLineShapeFromScreenPoints(pageEd, pdfPoints, style);
    } else if (hasCanvasSide) {
      // Never actually crossed — stayed on the canvas side. Plain stroke.
      createLineShapeFromScreenPoints(canvasEd, canvasPoints, style);
    }
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

    isDraggingRef.current = true;
    pointsRef.current = [{ x: e.clientX, y: e.clientY }];
    setPreviewPoints(pointsRef.current);
    setIsDragging(true);

    const pointerId = e.pointerId;

    const handleWindowMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !isDraggingRef.current) return;
      pointsRef.current = [...pointsRef.current, { x: ev.clientX, y: ev.clientY }];
      setPreviewPoints(pointsRef.current);
    };

    const handleWindowUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      finishDrag({ x: ev.clientX, y: ev.clientY });
    };

    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);

    cleanupWindowListenersRef.current = () => {
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("pointercancel", handleWindowUp);
    };
  };

  // Safety net: if this component unmounts mid-drag (e.g. the active tool
  // changed away from "draw" via a keyboard shortcut while dragging), don't
  // leak the window listeners — abandon the in-progress drag without
  // creating any shapes from a partial point list.
  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        finishDrag({ x: 0, y: 0 }, /* abandon */ true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (currentToolId !== "draw" || !pageEditor || !canvasEditor) {
    return null;
  }

  return (
    <>
      <div
        onPointerEnter={handlePointerEnter}
        onPointerDown={handlePointerDown}
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
