// Cross-layer drawing (see docs/architecture.md § Cross-Layer Drawing).
//
// A drag that starts on the PDF panel and crosses into the linked-canvas
// panel (or vice versa) is captured in screen space by CrossLayerCapture.tsx,
// then split and converted here into two independent shapes — one per
// editor, in that editor's own coordinate space, linked by a shared
// `strokeGroupId`.
//
// Point conversion deliberately does NOT go through src/canvas/coordinates.ts.
// Surface 2/3 already established that once a surface is rendered by a real
// tldraw instance, tldraw's own camera *is* the Transform — pdfToWorld/
// worldToPdf were never extended for the PDF page (identical space by
// construction) or for spillover (same reason). The PDF panel and the linked
// canvas are both real tldraw instances, so the natural continuation is
// tldraw's own `editor.screenToPage()`, which already knows that editor's
// screenBounds and live camera (correctly handling the PDF panel's *locked*
// camera and the canvas panel's *live* pan/zoom with the same call) — see
// docs/coordinates.md for the full note.
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultSizeStyle,
} from "@tldraw/tlschema";
import { getIndices, type IndexKey } from "@tldraw/utils";
import { createShapeId, type Editor, type TLShapePartial } from "tldraw";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface LineStyle {
  color: TLDefaultColorStyle;
  dash: TLDefaultDashStyle;
  size: TLDefaultSizeStyle;
}

// Reads the given editor's current "next shape" style — used to capture the
// origin panel's style once at the start of a cross-boundary drag, so both
// resulting segments look like one consistent stroke rather than each
// picking up whatever style happens to be current in its own panel.
export function getCurrentLineStyle(editor: Editor): LineStyle {
  return {
    color: editor.getStyleForNextShape(DefaultColorStyle),
    dash: editor.getStyleForNextShape(DefaultDashStyle),
    size: editor.getStyleForNextShape(DefaultSizeStyle),
  };
}

// Splits a temporally-ordered list of screen points at a vertical divider
// x-coordinate. Order is preserved within each bucket, so a drag that
// crosses the boundary more than once still produces exactly one point list
// per side (matching the two-segment storage model — see data-model.md
// § Cross-Layer Strokes) rather than one shape per crossing.
export function splitPointsAtDivider(
  points: ScreenPoint[],
  dividerX: number
): { left: ScreenPoint[]; right: ScreenPoint[] } {
  const left: ScreenPoint[] = [];
  const right: ScreenPoint[] = [];
  for (const point of points) {
    (point.x < dividerX ? left : right).push(point);
  }
  return { left, right };
}

// Creates a `line` shape from a raw screen-point list, converting through
// the target editor's own screenToPage(). Returns false (no-op) if there
// aren't enough points to form a visible line — callers should skip an
// empty/single-point side rather than create a degenerate shape.
export function createLineShapeFromScreenPoints(
  editor: Editor,
  screenPoints: ScreenPoint[],
  style: LineStyle,
  meta: Record<string, string | null> = {}
): boolean {
  if (screenPoints.length < 2) return false;

  const pagePoints = screenPoints.map((p) => editor.screenToPage(p));
  const indices = getIndices(pagePoints.length);
  const points: Record<string, { id: string; index: IndexKey; x: number; y: number }> = {};
  pagePoints.forEach((p, i) => {
    points[`p${i}`] = { id: `p${i}`, index: indices[i], x: p.x, y: p.y };
  });

  const shape: TLShapePartial = {
    id: createShapeId(),
    type: "line",
    x: 0,
    y: 0,
    props: { points, spline: "line", ...style, scale: 1 },
    meta,
  };

  editor.createShapes([shape]);
  return true;
}

export function makeStrokeGroupId(): string {
  return `clg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
