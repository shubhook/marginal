export interface Point {
  x: number;
  y: number;
}

export interface Transform {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// PDF space: fixed page dimensions (e.g., 612x792 for US Letter)
// World/Canvas space: offset by pan (offsetX, offsetY) and scaled by zoom factor
// Screen space: what the user's pointer reports (browser coordinates)

/**
 * Convert a point from PDF page space to canvas world space.
 * PDF space is fixed; world space accounts for pan offset and zoom.
 */
export function pdfToWorld(point: Point, transform: Transform): Point {
  return {
    x: point.x * transform.zoom + transform.offsetX,
    y: point.y * transform.zoom + transform.offsetY,
  };
}

/**
 * Convert a point from canvas world space back to PDF page space.
 */
export function worldToPdf(point: Point, transform: Transform): Point {
  return {
    x: (point.x - transform.offsetX) / transform.zoom,
    y: (point.y - transform.offsetY) / transform.zoom,
  };
}

/**
 * Convert a point from screen space to canvas world space.
 * This requires knowing where the canvas container is positioned on screen.
 */
export function screenToWorld(
  screenPoint: Point,
  canvasContainerRect: DOMRect
): Point {
  return {
    x: screenPoint.x - canvasContainerRect.left,
    y: screenPoint.y - canvasContainerRect.top,
  };
}

/**
 * Convert a point from canvas world space back to screen space.
 */
export function worldToScreen(
  worldPoint: Point,
  canvasContainerRect: DOMRect
): Point {
  return {
    x: worldPoint.x + canvasContainerRect.left,
    y: worldPoint.y + canvasContainerRect.top,
  };
}

/**
 * One-shot convenience: screen → world space for drawing operations.
 */
export function screenToWorldInCanvas(
  screenPoint: Point,
  canvasContainerRect: DOMRect,
  transform: Transform
): Point {
  const worldPoint = screenToWorld(screenPoint, canvasContainerRect);
  return worldPoint;
}

/**
 * One-shot convenience: screen → PDF space (requires going through world first).
 */
export function screenToPdf(
  screenPoint: Point,
  canvasContainerRect: DOMRect,
  transform: Transform
): Point {
  const worldPoint = screenToWorld(screenPoint, canvasContainerRect);
  return worldToPdf(worldPoint, transform);
}

/**
 * Apply a zoom centered at a given world-space point.
 * Returns updated transform.
 */
export function applyZoom(
  currentTransform: Transform,
  zoomFactor: number,
  centerWorldPoint: Point
): Transform {
  const newZoom = Math.max(0.1, currentTransform.zoom * zoomFactor);
  const zoomRatio = newZoom / currentTransform.zoom;

  // Adjust offset so the zoom center stays fixed
  const newOffsetX =
    centerWorldPoint.x -
    (centerWorldPoint.x - currentTransform.offsetX) * zoomRatio;
  const newOffsetY =
    centerWorldPoint.y -
    (centerWorldPoint.y - currentTransform.offsetY) * zoomRatio;

  return {
    offsetX: newOffsetX,
    offsetY: newOffsetY,
    zoom: newZoom,
  };
}

/**
 * Apply a pan (delta in world space).
 */
export function applyPan(
  transform: Transform,
  delta: Point
): Transform {
  return {
    ...transform,
    offsetX: transform.offsetX + delta.x,
    offsetY: transform.offsetY + delta.y,
  };
}

/**
 * Reset transform to defaults (1:1 zoom, no offset).
 */
export function resetTransform(): Transform {
  return {
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
  };
}
