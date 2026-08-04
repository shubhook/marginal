// PDF-side spillover shape helpers (Surface 3).
//
// Approach chosen (see docs/architecture.md § Linked Canvases & Spillover):
// spillover shapes live inside the *page's own* tldraw store (persistenceKey
// `page-${pageId}`), tagged with `meta.canvasId`, alongside direct markup and
// the page background image. Only the shapes whose `meta.canvasId` matches
// the page's active canvas are visible; the rest are hidden (opacity 0,
// locked). Direct markup and the background are untagged and always visible.
//
// Real cross-layer drawing (next milestone) will create these tagged shapes
// by splitting a stroke at the panel boundary. Until then, `addTestSpillover`
// is a temporary affordance to exercise the visibility rule.
import { toRichText, type Editor, type TLDefaultColorStyle, type TLShapeId } from "tldraw";

const SPILLOVER_COLORS: TLDefaultColorStyle[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "violet",
  "light-violet",
  "grey",
];

export function spilloverColorForIndex(index: number): TLDefaultColorStyle {
  return SPILLOVER_COLORS[((index % SPILLOVER_COLORS.length) + SPILLOVER_COLORS.length) % SPILLOVER_COLORS.length];
}

// Every canvas's test mark is placed at the same anchor so an incorrect
// "multiple visible at once" bug would show as overlapping shapes, not
// shapes that merely look independently plausible in their own corner.
export function addTestSpillover(
  editor: Editor,
  canvasId: string,
  label: string,
  colorIndex: number
): void {
  editor.run(
    () => {
      editor.createShapes([
        {
          type: "geo",
          x: 40,
          y: 40,
          props: {
            geo: "rectangle",
            w: 180,
            h: 110,
            color: spilloverColorForIndex(colorIndex),
            fill: "solid",
            richText: toRichText(`${label} spillover`),
          },
          meta: { canvasId },
        },
      ]);
    },
    { history: "ignore" }
  );
}

export function applySpilloverVisibility(editor: Editor, activeCanvasId: string | null): void {
  const spilloverShapes = editor
    .getCurrentPageShapes()
    .filter((shape) => typeof shape.meta?.canvasId === "string");

  if (spilloverShapes.length === 0) return;

  editor.run(
    () => {
      for (const shape of spilloverShapes) {
        const isActive = shape.meta.canvasId === activeCanvasId;
        const wantOpacity = isActive ? 1 : 0;
        if (shape.opacity === wantOpacity && shape.isLocked === !isActive) continue;
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          opacity: wantOpacity,
          isLocked: !isActive,
        });
      }
    },
    { history: "ignore" }
  );
}

export function removeSpilloverForCanvas(editor: Editor, canvasId: string): void {
  const ids: TLShapeId[] = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.meta?.canvasId === canvasId)
    .map((shape) => shape.id);

  if (ids.length === 0) return;
  editor.run(() => editor.deleteShapes(ids), { history: "ignore" });
}
