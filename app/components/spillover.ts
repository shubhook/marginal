// Canvas-tag visibility helpers (Single Canvas Migration — see
// docs/architecture.md § Linked Canvases & Spillover and
// docs/build-order.md § Single Canvas Migration).
//
// Every shape drawn on a Page lives in that page's single shared tldraw
// store (persistenceKey `page-${pageId}`), tagged with `meta.canvasId` —
// set automatically at creation time (see PDFViewer.tsx's beforeCreate
// shape hook, backed by canvasState.ts's `tagShapeMeta`) to whichever
// canvas is active when the shape is drawn. The PDF page background
// carries the reserved sentinel `meta.canvasId: null` and is always
// visible, regardless of which canvas is active.
//
// This used to be called "spillover" — a term for the subset of a linked
// canvas's content that also rendered on the PDF page, distinct from
// "direct markup" belonging to no canvas. That distinction is gone: under
// the single-store model, *all* markup belongs to whichever canvas was
// active when it was drawn, so the same tag-and-toggle mechanism now
// applies uniformly instead of to a subset. The functions and file name are
// unchanged from that era since the underlying visibility logic already
// generalizes correctly — only what counts as "tagged" grew to cover
// everything.
//
// The actual show/hide and sweep-on-delete decisions are pure functions in
// canvasState.ts (unit-tested there, no Editor needed); these two
// functions are thin wrappers that read shapes off a real Editor, run
// the pure logic, and apply the result.
import { type Editor, type TLShapeId } from "tldraw";
import { computeVisibilityUpdates, idsTaggedWithCanvas } from "./canvasState";

// Shows only the active canvas's tagged shapes; hides every other
// canvas-tagged shape. The `null`-tagged background (and anything else
// lacking a string `meta.canvasId`) is never touched, so it stays visible
// regardless of which canvas is active.
export function applySpilloverVisibility(editor: Editor, activeCanvasId: string | null): void {
  const shapes = editor.getCurrentPageShapes();
  const updates = computeVisibilityUpdates(
    shapes.map((shape) => ({
      id: shape.id,
      canvasId: shape.meta?.canvasId,
      opacity: shape.opacity,
      isLocked: shape.isLocked,
    })),
    activeCanvasId
  );

  if (updates.length === 0) return;

  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));
  editor.run(
    () => {
      for (const update of updates) {
        const shape = shapesById.get(update.id as TLShapeId);
        if (!shape) continue;
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          opacity: update.opacity,
          isLocked: update.isLocked,
        });
      }
    },
    { history: "ignore" }
  );
}

// Sweeps a deleted canvas's tagged shapes out of the page store — called
// from PDFViewer.tsx's handleDelete before the Canvas row itself is deleted.
export function removeSpilloverForCanvas(editor: Editor, canvasId: string): void {
  const shapes = editor.getCurrentPageShapes();
  const ids = idsTaggedWithCanvas(
    shapes.map((shape) => ({ id: shape.id, canvasId: shape.meta?.canvasId })),
    canvasId
  ) as TLShapeId[];

  if (ids.length === 0) return;
  editor.run(() => editor.deleteShapes(ids), { history: "ignore" });
}
