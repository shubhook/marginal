# UI.md — Marginal

> Interaction and layout rules. Covers *how things behave and are arranged*, not visual style (see STYLING.md for colors/typography). Update as real usage reveals what actually works.

**Version:** 0.1
**Last updated:** 2026-08-04

---

## 1. Top-level layout

```
┌───────────────────────────────────────────────────┐
│ Sidebar (notebooks)  │  Main surface  │ Panel     │
│                      │                │ (optional)│
└───────────────────────────────────────────────────┘
```

- **Sidebar** (left, collapsible): list of notebooks, and within the active notebook, its Boards and PDFDocuments. Persistent across the app.
- **Main surface**: either a Board (canvas) or a PDFDocument page, depending on what's open.
- **Right panel** (only present when a PDF page's linked-canvas view is open): tabs for that page's Canvases. Not shown otherwise — don't reserve permanent screen space for it.

Sidebar should be collapsible (keyboard shortcut, TBD — placeholder `Cmd+B` matching common editor convention) since the canvas/PDF surface is the primary work area and should be able to go full-width.

## 2. Navigation model

- Opening a Notebook shows its contents (Boards + PDFDocuments) as a list/grid in the sidebar or a landing view — pick list for v1, simpler to build and matches a "notes app" mental model over a "file browser" one.
- Opening a Board or PDF page replaces the main surface content; sidebar stays visible for switching.
- No modal-based navigation — switching context should never require closing a dialog first. Everything reachable via sidebar click or keyboard shortcut.

## 3. Toolbar

- Floating, bottom-center pill (Excalidraw convention) — not a docked sidebar toolbar. Keeps canvas space maximized.
- Tools: select (v), pen (p), rectangle (r), text (t), eraser (e), highlighter (h — for PDF markup specifically).
- Toolbar is contextual: on a Board it shows canvas tools; on a PDF page it shows the same tools but scoped to the active layer (direct markup vs. active linked canvas — see §5).

## 4. PDF page view — direct markup mode

- PDF page rendered at native aspect ratio, fixed dimensions matching the source page.
- Corner button (top-right of the page, small, unobtrusive) toggles the right panel for linked canvases.
- Direct markup tools draw straight onto the page's own coordinate space — this is the "write in the margin" mode, always available regardless of whether the right panel is open.

## 5. Linked canvas panel

- Opened via the corner button. Shows tabs, one per linked Canvas for that page.
- A "+" tab creates a new linked Canvas (auto-focused after creation).
- Only one Canvas is "active" per page at a time (tab selection = active state). Switching tabs swaps which Canvas's PDF-spillover strokes render on the page — this should feel instantaneous, no loading state for a local operation.
- Closing the panel does not delete anything — it just hides the panel. The active-canvas state and its spillover on the PDF page persist.

## 6. Cross-layer drawing (PDF ↔ linked canvas)

- Only active when the right panel is open (there's no "cross boundary" target when it's closed).
- A drag that starts on the PDF page and crosses into the panel (or vice versa) should render as one continuous, unbroken stroke visually, in real time, while drawing.
- After the stroke completes, it's split and stored per §"Cross-layer strokes" in AGENTS.md — this is a storage-layer detail, invisible to the user in the moment of drawing.
- Known, accepted limitation: if either side is panned/zoomed after a cross-boundary stroke is drawn, the two halves can visually separate (they're independently-transformed coordinate spaces). This is not a bug to silently "fix" with a hack — if it becomes a real usability problem in practice, that's a decision to revisit in PRD.md, e.g. locking zoom-sync between the two panels for the duration a cross-boundary stroke exists.

## 7. Empty / default states

- New Notebook: empty state should surface a clear "create Board" / "import PDF" affordance — no dead-end blank screens.
- New PDF page: auto-creates Canvas 0 as the active canvas (per AGENTS.md data model rule) — there is never a state where a page has "no active canvas."
- New Board: opens directly into an empty infinite canvas, ready to draw — no intermediate "name your board" modal blocking the first stroke. Default name can be assigned automatically (e.g. "Untitled Board — Aug 4"), renamed later from the sidebar.

## 8. Keyboard shortcuts (v1 baseline)

| Key | Action |
|---|---|
| `v` | Select tool |
| `p` | Pen |
| `r` | Rectangle |
| `t` | Text |
| `e` | Eraser |
| `h` | Highlighter (PDF context) |
| `Cmd+B` | Toggle sidebar |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / redo |

This list is a starting point, not final — extend as real usage surfaces friction (e.g. quick notebook switcher, page navigation within a PDF).

## Changelog

- 2026-08-04 — Initial UI.md drafted alongside PRD and AGENTS.md.
