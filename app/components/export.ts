import { Box, exportAs, type Editor, type TLShapeId } from "tldraw";
import type { Board, Page } from "@/src/storage/types";

export type ExportImageFormat = "png" | "svg";

// Shapes belonging to a hidden canvas are given opacity 0 by
// applySpilloverVisibility (see spillover.ts) — filtering on that is how
// export stays in sync with tag-based visibility without re-deriving it.
export function getVisibleShapeIds(editor: Editor): TLShapeId[] {
  return editor
    .getCurrentPageShapes()
    .filter((shape) => shape.opacity !== 0)
    .map((shape) => shape.id);
}

// Board export: everything on the page, auto-trimmed to content bounds
// (tldraw's default `padding: 'auto'`) — a Board has no fixed page size to
// bound against, so there's nothing more specific to crop to.
export async function exportBoard(
  editor: Editor,
  board: Pick<Board, "name">,
  format: ExportImageFormat
): Promise<void> {
  await exportAs(editor, [...editor.getCurrentPageShapeIds()], {
    format,
    name: board.name,
  });
}

// Page export: bounded explicitly to the PDF page's own dimensions, not
// auto-trimmed — canvas ink can extend anywhere on the shared infinite
// canvas post-migration (see docs/architecture.md § Single Canvas
// Migration), so auto-trim would make export size depend on stray marks
// far from the page. Only the currently-visible canvas's shapes are
// included via getVisibleShapeIds.
export async function exportPage(
  editor: Editor,
  page: Pick<Page, "width" | "height" | "pageNumber">,
  format: ExportImageFormat
): Promise<void> {
  await exportAs(editor, getVisibleShapeIds(editor), {
    format,
    name: `Page ${page.pageNumber + 1}`,
    bounds: new Box(0, 0, page.width, page.height),
    padding: 0,
  });
}
