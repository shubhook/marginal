// Pure logic behind the single shared page canvas — extracted out of
// PDFViewer.tsx/spillover.ts so it's unit-testable without a real tldraw
// Editor or React component tree, per the same "isolate pure logic"
// principle already used for src/canvas/coordinates.ts (see AGENTS.md §4).
//
// Three mechanisms live here, all pure functions over plain data:
// 1. Tagging — what meta a newly-created shape should get.
// 2. Visibility — which tagged shapes should be shown/hidden for a given
//    active canvas.
// 3. Camera save/restore — which Canvas row's lastCameraPosition changes
//    on a switch, and what camera (if any) to restore.
//
// The Editor-facing wrappers (PDFViewer.tsx's beforeCreate hook,
// spillover.ts's applySpilloverVisibility/removeSpilloverForCanvas, and
// PDFViewer.tsx's savePreviousCanvasCamera/restoreCanvasCamera) call these
// and apply the result via editor/Dexie calls — the decision logic itself
// has no tldraw or React dependency.
import type { Canvas } from "@/src/storage/types";

export type CameraSnapshot = { x: number; y: number; z: number };

// --- 1. Tagging --------------------------------------------------------

// A shape that already carries an explicit `canvasId` key (the PDF
// background's reserved `null` sentinel, or a pasted/duplicated shape
// preserving its original tag) is left alone. Anything else gets tagged
// with whichever canvas is active right now.
export function tagShapeMeta(
  meta: Record<string, unknown> | undefined,
  activeCanvasId: string | null
): Record<string, unknown> {
  if (meta && "canvasId" in meta) return meta;
  return { ...meta, canvasId: activeCanvasId };
}

// --- 2. Visibility -------------------------------------------------------

export interface TaggedShapeSnapshot {
  id: string;
  canvasId: unknown; // raw meta.canvasId, as read off the shape
  opacity: number;
  isLocked: boolean;
}

export interface VisibilityUpdate {
  id: string;
  opacity: number;
  isLocked: boolean;
}

// Shapes whose `canvasId` isn't a string (undefined, or the `null`
// sentinel) are never touched — they stay always-visible, same as the PDF
// background. Only shapes that already match their target state are
// skipped, so callers can diff this against a real editor.updateShape
// without redundant no-op writes.
export function computeVisibilityUpdates(
  shapes: TaggedShapeSnapshot[],
  activeCanvasId: string | null
): VisibilityUpdate[] {
  const updates: VisibilityUpdate[] = [];
  for (const shape of shapes) {
    if (typeof shape.canvasId !== "string") continue;
    const isActive = shape.canvasId === activeCanvasId;
    const wantOpacity = isActive ? 1 : 0;
    const wantLocked = !isActive;
    if (shape.opacity === wantOpacity && shape.isLocked === wantLocked) continue;
    updates.push({ id: shape.id, opacity: wantOpacity, isLocked: wantLocked });
  }
  return updates;
}

// Ids of every shape tagged with the given canvas — used to sweep a
// deleted canvas's shapes out of the page store.
export function idsTaggedWithCanvas(
  shapes: { id: string; canvasId: unknown }[],
  canvasId: string
): string[] {
  return shapes.filter((shape) => shape.canvasId === canvasId).map((shape) => shape.id);
}

// --- 3. Camera save/restore ---------------------------------------------

// Returns a new Canvas[] with `canvasId`'s lastCameraPosition set to
// `camera` — the array update PageShell applies optimistically (and
// mirrors to Dexie) whenever switching away from a canvas.
export function withSavedCamera(
  canvases: Canvas[],
  canvasId: string,
  camera: CameraSnapshot
): Canvas[] {
  return canvases.map((c) => (c.id === canvasId ? { ...c, lastCameraPosition: camera } : c));
}

// The camera to restore when switching to `canvasId`, or null if there's
// nothing to restore (canvasId is null, not found, or has never been
// active before) — callers should leave the camera wherever it currently
// is in that case, not jump to a default/origin position.
export function cameraToRestore(
  canvases: Canvas[],
  canvasId: string | null
): CameraSnapshot | null {
  if (!canvasId) return null;
  const target = canvases.find((c) => c.id === canvasId);
  return target?.lastCameraPosition ?? null;
}
