# Architecture

Marginal's system design and how components interact.

## System Overview

```
┌─────────────────────────────────────────────────────┐
│  React App (Next.js App Router, client-only)        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐         ┌────────────────────┐    │
│  │   Sidebar    │─────────│  AppContainer      │    │
│  │              │         │  (state, routing)  │    │
│  └──────────────┘         └────────────────────┘    │
│         ▲                           │               │
│         │                           ▼               │
│         │                  ┌────────────────────┐   │
│         └──────────────────│  Main Surface      │   │
│                            │  (Editor/Canvas)   │   │
│                            └────────────────────┘   │
│                                     │               │
│                                     ▼               │
│                            ┌────────────────────┐   │
│                            │  tldraw Instance   │   │
│                            │  (Drawing)         │   │
│                            └────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
                             ▲
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼──────┐         ┌────────▼──────┐
        │  IndexedDB   │         │  Coordinates  │
        │  (Dexie)     │         │  Transforms   │
        │              │         │  (pure math)  │
        └──────────────┘         └───────────────┘
```

## Entity Hierarchy

```
Notebook (flat container)
  ├── Board (infinite canvas)
  └── PDFDocument
       └── Page (fixed dimensions)
            ├── Direct markup (on page)
            └── Canvas[] (linked side-canvases)
                 └── activeCanvasId (only one active per page)
```

**Key invariants:**
- A Notebook has no nesting (flat by design, not a bug)
- Every Page auto-creates Canvas 0 as active (no null state)
- Cross-layer strokes store two linked segments with shared `strokeGroupId`

## Coordinate Spaces

Three independent coordinate systems, each with its own transforms:

| Space | Use | Dimensions | Transform |
|-------|-----|------------|-----------|
| **PDF-page** | Source PDF pages | Fixed (e.g., 612×792) | None; fixed origin |
| **Canvas/World** | Pan/zoom on a single surface | Infinite | `offsetX/Y` + `zoom` |
| **Screen** | Browser viewport | Variable | Element offset on page |

**Conversions:** Always go through pure functions (`pdfToWorld`, `worldToPdf`, `screenToWorld`, etc.) defined in `src/canvas/coordinates.ts`. Never inline coordinate math into event handlers.

## Data Flow

### Creating/Editing
1. **UI Component** (Sidebar, Editor) calls data-access function (e.g., `createNotebook()`)
2. **Data-access layer** (`src/storage/db.ts`) updates IndexedDB and returns result
3. **Component** updates local state (optimistic update)
4. **UI re-renders** with new data

Example:
```
User clicks "New Notebook"
  → Sidebar calls createNotebook(name)
  → db.ts adds to Dexie, returns Notebook
  → Sidebar setState(newNotebook)
  → Sidebar re-renders with new item
```

### Reading
1. **Component mounts or key changes**
2. **useEffect** calls data-access function (e.g., `getNotebooksList()`)
3. **State updates** with fetched data
4. **UI re-renders**

Example:
```
Sidebar mounts
  → useEffect fires
  → loadNotebooks() calls getNotebooksList()
  → setState(notebooks)
  → Sidebar re-renders list
```

## Component Tree

```
RootLayout
└── AppContainer (client-only, mounted after hydration)
     ├── Sidebar (notebook list, CRUD)
     │   ├── collapsed: icon rail (new-notebook, switcher popover, expand toggle)
     │   ├── expanded: full list (create/rename/delete) + switcher popover
     │   └── DeleteConfirmationDialog (overlay)
     └── Main surface (state-driven: notebook → contents → item)
         ├── (no notebook selected) → empty state
         ├── (notebook selected, nothing open) → NotebookContents
         │    │  (boards + PDFs together: create board, import PDF,
         │    │   rename/delete either — per UI navigation model)
         │    └── DeleteConfirmationDialog (overlay)
         ├── (board open) → Editor
         │    └── tldraw instance (persistenceKey `board-${boardId}`,
         │        stock tldraw UI — not affected by the PDF-panel work below)
         └── (PDF open) → PDFViewer
              └── PageShell (one per page, keyed by pageId)
                   ├── unified header row (page nav left, canvas tabs right)
                   ├── PageMarkupEditor (hideUi)
                   │    └── tldraw instance (persistenceKey `page-${pageId}`) —
                   │        direct markup + background + spillover shapes,
                   │        camera locked to a fixed fit
                   ├── corner button (toggles right panel)
                   ├── (panel open) → RightPanel (hideUi)
                   │    └── tldraw instance for the active canvas
                   │         (persistenceKey `canvas-${canvasId}`, free camera)
                   └── FloatingTldrawUi — tldraw's real DefaultToolbar +
                        DefaultStylePanel, rendered once, bound via
                        activeEditorRef to whichever of the two tldraw
                        instances above the pointer last entered
```

**Note on this hierarchy:** an earlier pass scoped the tldraw `persistenceKey` directly to `notebookId`, which collapsed Notebook → Board → Canvas into Notebook → Canvas — a notebook could only ever hold one implicit canvas, not multiple named boards. This was corrected: `AppContainer` tracks an `activeItem` (`board` or `pdf`) alongside `activeNotebookId`, selecting a notebook shows `NotebookContents` (not a canvas), and only opening a specific item mounts its editor. This matches the entity hierarchy described above and in [Data Model](./data-model.md).

## PDF Rendering & Direct Markup (Surface 2)

**Decided implementation (2026-08-04):**

- **Page navigation: single-page view with prev/next buttons** (not vertical scroll). One tldraw instance is mounted at a time, keyed by pageId, which keeps every page's markup store isolated and mirrors the board pattern exactly. Vertical scroll was the rejected alternative — it would require many simultaneous tldraw instances or a custom unified surface, neither justified for v1.
- **Rendering pipeline:** `src/pdf/pdfjs.ts` loads PDF.js lazily via dynamic import (PDF.js touches browser globals at module scope, so a static import would break Next's SSR pass even in client components). `src/pdf/renderer.ts` caches the parsed document per PDFDocument and the rendered bitmap per Page (2× oversampled PNG with the 1px `border-subtle` page outline baked in).
- **Coordinate model:** the rendered page bitmap is inserted **inside** the page's tldraw instance as a locked image shape at (0,0) sized to the page's native PDF-point dimensions. PDF-page space and tldraw page space are therefore **identical by construction** — a stroke at tldraw (x, y) is at PDF point (x, y), and the tldraw camera plays the role of the `Transform` from `src/canvas/coordinates.ts` (`pdfToWorld`/`worldToPdf` with the identity page placement). Pan/zoom moves page and markup together, so markup can never drift relative to the page, and no new coordinate math exists anywhere in the PDF path.
- **Bitmap persistence:** the background image shape (deterministic id `pdfbg-${pageId}`) and its asset persist in the page's tldraw store, so a page is re-rendered by PDF.js only if its store doesn't already contain the background (first open), not on every visit.

## Linked Canvases & Spillover (Surface 3)

**Decided implementation (2026-08-04):**

Surface 2 made a Page's direct-markup layer and its tldraw coordinate space identical by embedding the PDF bitmap directly into the page's own tldraw store — that worked because a Page had exactly one markup layer. Surface 3 adds multiple linked Canvases per Page, and per [Data Model](./data-model.md#canvas), only the *active* canvas's PDF-side "spillover" should render on the page at once.

Two approaches were considered:

- **(a) One tldraw store per page, strokes tagged with `canvasId`, visibility toggled by filtering which shapes render based on `activeCanvasId`.**
- (b) Separate page-level tldraw stores per canvas, swapped in/out as the active canvas changes.

**Chosen: (a).** Reasons:

- (b) would force a full remount of the page's tldraw instance (including re-verifying/recreating the background bitmap) on every tab switch — directly conflicting with the "switching tabs must feel instant, no loading state" requirement (ui-interaction.md §5).
- (b) would also require the page background image and any direct markup to be duplicated into every per-canvas "page copy," risking drift between copies. Under (a) there is exactly one page store, so direct markup and the background can never be out of sync with themselves.
- (a) composes naturally with cross-layer drawing (next milestone): when a stroke is split at the panel boundary, the PDF-side segment is just another page-store shape tagged with `canvasId` and the shared `strokeGroupId`. No architecture change is needed to go from "spillover visibility" (this milestone) to "spillover creation via real cross-layer strokes" (next milestone).
- Deleting a canvas or its whole page already deletes the correct data: canvas-tagged shapes live inside `page-${pageId}`'s own tldraw store, so deleting the page (or the PDF, or the notebook) removes them automatically as part of the existing tldraw-store cascade — no separate spillover cleanup path was needed for those cases. Deleting a single (non-last) canvas does need an explicit sweep of its tagged shapes from the page store, which `handleDeleteCanvas` performs (see `app/components/spillover.ts` → `removeSpilloverForCanvas`).

**Coordinate transforms:** `pdfToWorld`/`worldToPdf` from `src/canvas/coordinates.ts` are **not** used for spillover, for the same reason Surface 2 didn't need them for direct markup — the spillover shapes live in the page's own tldraw store at PDF-page coordinates by construction (approach (a)), so page space and tldraw space are already identical. Each linked **Canvas**, however, *is* a genuinely separate coordinate space (own pan/zoom, own tldraw store `canvas-${canvasId}`) — see [Coordinates § Multiple Canvas Spaces](./coordinates.md#future-multiple-canvas-spaces). Cross-layer drawing (next milestone) will be the first feature that actually needs a transform between a Canvas's world space and the Page's PDF space, since that's when a single in-progress stroke will span both.

**Implementation:**

- `app/components/spillover.ts` — `applySpilloverVisibility(editor, activeCanvasId)` sets `opacity`/`isLocked` on every shape with `meta.canvasId` set, showing only the active canvas's; untagged shapes (direct markup, the background image) are never touched. `addTestSpillover` is a **temporary test affordance** for this milestone only — it creates a tagged marker shape so the visibility rule can be exercised before real cross-layer drawing exists to create tagged shapes organically. `removeSpilloverForCanvas` sweeps a deleted canvas's tagged shapes out of the page store.
- `app/components/PDFViewer.tsx` — `PageShell` owns `activeCanvasId` (mirrors `Page.activeCanvasId`, the source of truth) and the mounted page `Editor` instance, and re-runs `applySpilloverVisibility` whenever either changes.
- `app/components/RightPanel.tsx` — tab bar (one per linked Canvas, plus "+") with the *active* canvas's own tldraw instance mounted below it, keyed by canvas id (`persistenceKey` `canvas-${canvasId}`) so switching tabs is a local remount, not a network operation.
- Corner button (`PDFViewer.tsx`) toggles the panel; it's rendered with `z-[400]` because tldraw's own style panel uses up to `z-index: 300` and would otherwise sit on top of it.

## Surface 3 Fix Pass I — Split Layout & Active Panel Tracking (2026-08-04)

Two UX/layout bugs were found after Surface 3 shipped and fixed:

**Resizable split.** The PDF panel and the linked-canvas panel are laid out as a split pane inside `PageShell` (`app/components/PDFViewer.tsx`), with a draggable divider (`role="separator"`) between them. Dragging updates `rightPanelWidth` state, clamped so the PDF panel never goes below 360px and the canvas panel never goes below 260px. The width is persisted to `localStorage` (`marginal:rightPanelWidth`) — deliberately **not** routed through `src/storage/db.ts`, since it's pure UI layout state, not application data the rest of the system needs to know about.

**Bounded panel container.** Both the PDF panel and the linked-canvas panel are wrapped in a `border border-[#2a2a2a] rounded-md overflow-hidden` container with a small inset from the app-shell background, so each reads as a distinct panel. This is a wrapper-level fix only — it does not touch the Surface 2 coordinate decision (the PDF bitmap embedded inside the page's own tldraw store at (0,0) native size); that remains correct and unchanged.

A third bug from this same pass — two tldraw instances each showing their own toolbar — was originally fixed by conditionally hiding each instance's stock UI based on which panel was active (`hideUi={activePanel !== <that panel>}`). **That approach was superseded one fix-pass later** by the shared Capsule toolbar — see below. `activePanel` survives as a concept, but now drives Capsule routing instead of `hideUi` toggling.

## Surface 3 Fix Pass II — Shared Capsule, Camera Lock, Header Alignment (2026-08-05)

Three more issues, addressed together because the underlying fix for one (tracking which panel is "active") is reused directly by cross-layer drawing, the next milestone:

**Why the custom toolbar got pulled forward from Polish.** STYLING.md §5 scopes the floating-pill toolbar as a Polish-phase *visual* task. This isn't that: tldraw's default UI has no concept of "one toolbar shared across two editor instances" — hiding/showing each instance's stock chrome (Fix Pass I's approach) can only show one editor's *own* toolbar, never a toolbar that belongs to neither. Building a toolbar that isn't owned by either `Tldraw` mount was the only way to get to "exactly one toolbar, ever" — an architectural requirement, not a styling one. What's still deferred to Polish: the actual STYLING.md §5 treatment (final icon set, exact spacing/shadow rules). The Capsule built here is functionally complete but visually rough on purpose.

**Header alignment.** The PDF page nav (prev/page/next) and the canvas tab bar used to render as two separate strips at different heights. Both are now rendered by `PageShell` in one unified header row: page nav on the left (`flex-1`, same `MIN_PAGE_PANEL_WIDTH` as the body's PDF panel), and, when the right panel is open, the canvas tab bar on the right at a width that exactly matches `rightPanelWidth`, separated by a spacer (`SPLIT_GAP_PX = 16`) sized to match the body row's divider footprint (`mx-1` + `w-2` + `mx-1`). Because the header and body share the same left/right padding and the same computed widths, the header's left/right split always lines up with the divider beneath it, including while dragging.

**Camera lock — the PDF panel is a fixed viewer, not a second canvas.** Before this fix, the PDF page mounted inside a normal tldraw camera (free pan/zoom), which is wrong for two reasons: it behaves like a second infinite canvas instead of a bounded document viewer, and a continuously-movable viewport has no stable frame to anchor a cross-boundary stroke to (next milestone). Fixed via tldraw's built-in camera-options API (`editor.setCameraOptions`), not by hand-rolling input interception:

```ts
editor.setCameraOptions({
  isLocked: true,
  wheelBehavior: "none",
  constraints: {
    bounds: new Box(0, 0, page.width, page.height),
    padding: { x: 32, y: 32 },
    origin: { x: 0.5, y: 0.5 },
    initialZoom: "fit-min",
    baseZoom: "fit-min",
    behavior: "fixed",
  },
});
editor.zoomToBounds(bounds, { inset: 32, force: true }); // initial fit, matches prior framing exactly
```

- `isLocked: true` disables every user-driven camera path (drag-pan, wheel/pinch-zoom, keyboard zoom shortcuts) at the source — tldraw's own camera methods (`pan`, `zoomIn`, `zoomToFit`, `resetZoom`, etc.) each check `cameraOptions.isLocked` and no-op unless called with `{ force: true }`. Shape creation/editing is untouched; only camera movement is gated.
- **Fit choice: `fit-min` (letterboxed containment).** Given a panel whose aspect ratio doesn't match the page's, `fit-min` scales by whichever axis requires the *smaller* zoom — i.e. the page's full extent is always entirely visible, letterboxed on whichever axis has slack. (`fit-max` would instead crop the page to fill the panel, which was rejected — the point of a document viewer is that you can always see the whole page.) This matches the pre-lock `zoomToBounds(..., { inset: 32 })` framing, so the initial view is visually unchanged.
- Resizing the split (dragging the divider) resizes the PDF panel's container; tldraw's internal resize handling recomputes the constrained camera automatically since the camera is defined in terms of `constraints` rather than a one-time fit — verified by dragging the divider and confirming the page re-centers/re-fits at the new width without any manual refit call.
- The linked-canvas panel is unaffected — it keeps a normal, fully free camera, since it's a real infinite canvas, not a fixed document panel.

**Shared Capsule toolbar (`app/components/Capsule.tsx`).** *(Superseded one fix-pass later — see Fix Pass III below. Kept here for history; the file no longer exists.)* Both the PDF panel's `Tldraw` and the linked-canvas panel's `Tldraw` now mount with `hideUi` unconditionally — neither ever shows its own chrome. `Capsule` is the only toolbar, rendered once by `PageShell`, positioned `absolute bottom-4 left-1/2 -translate-x-1/2` relative to the split container (so it's centered over whichever panels are currently visible — just the PDF panel when closed, both combined when open — not the whole browser viewport, which would misalign it against the sidebar). Buttons: select, pen (draw), rectangle (geo), text, eraser, undo, redo — the STYLING.md §5 tool list plus undo/redo, styled minimally (dark pill, visible active state) with full visual treatment deferred to Polish.

**Active-editor routing.** `PageShell` holds `activeEditorRef` (a `RefObject<Editor | null>`) plus an `activeEditorVersion` counter used purely to force React to re-run the Capsule's reactive subscription when the ref's target changes (a plain ref mutation doesn't trigger a re-render on its own). `activePanel: 'page' | 'canvas'` — the same state introduced in Fix Pass I — is set via `onPointerEnter` on each panel's wrapper div; an effect re-points `activeEditorRef.current` to whichever editor (`pageEditor` or `canvasEditor`) corresponds to `activePanel` and bumps the version whenever the target actually changes (including when the canvas panel remounts a new `Tldraw` instance on tab switch while the pointer is still over it). Every Capsule button reads `activeEditorRef.current` at click time — never a closed-over editor — so it always targets whichever panel the cursor last entered. The Capsule's active-tool highlight uses `useValue` from `@tldraw/state-react` with `[activeEditorRef, version]` as deps, so it both re-subscribes when the target editor changes and reactively reflects that editor's `currentToolId` changing.

**This is shared groundwork, not a toolbar-only fix.** Cross-layer drawing (next milestone) needs exactly this signal — which panel the pointer is in — to know whether a drag is starting on the PDF page or in the active linked canvas, so it can route the drag's coordinates into the right space and, on crossing the panel boundary, split the stroke into its two tagged segments (see [Linked Canvases & Spillover](#linked-canvases--spillover-surface-3)). `activePanel`/`activeEditorRef` from this fix pass is that mechanism, not a new one to be built next milestone.

## Surface 3 Fix Pass III — tldraw's Own UI, Collapsible Sidebar (2026-08-05)

**Replacing the hand-built Capsule with tldraw's real toolbar and style panel (`app/components/FloatingTldrawUi.tsx`).** The Capsule from Fix Pass II solved "exactly one toolbar" but at the cost of real functionality — no style panel, no hand tool, arrow, sticky note, image upload, or "more tools" overflow. Rebuilding those individually wasn't worth it, so this pass renders tldraw's actual `DefaultToolbar` and `DefaultStylePanel` components instead, still shared across both panels via the same `activeEditorRef`/`activePanel` mechanism from Fix Pass II (unchanged).

This works standalone (outside a full `<Tldraw>` app) because `DefaultToolbar`/`DefaultStylePanel` read the editor via React context (`useEditor()`), not by requiring the whole app wrapper — confirmed by reading tldraw's own source: `Tldraw` is just `TldrawEditor` (establishes `EditorContext`) wrapping `TldrawUi` (which is `TldrawUiContextProvider` — itself just `useMaybeEditor()`, tolerant of an externally supplied context — around the UI content). Getting an actually-working standalone extraction took three internals, not the one that seemed sufficient going in:

1. **`EditorContext.Provider value={editor}`** — expected: supplies which editor via React context, re-supplied whenever `activeEditorRef`'s target changes (driven by the same `version` counter from Fix Pass II, which forces `FloatingTldrawUi` to re-render).
2. **`ContainerProvider`** — discovered via a runtime `"useContainer used outside of <Tldraw />"` crash. `DefaultToolbar` calls `useContainer()` internally; supplied by wrapping in a ref'd div and passing that DOM node to `ContainerProvider`.
3. **The `.tl-container`/`.tl-theme__dark` classes have to live on that *exact* ref'd element, not a child wrapper** — discovered by the "more tools" overflow menu rendering with correct layout but no theme (near-invisible icons on a white background). Radix's `DropdownMenu.Portal` (which tldraw's dropdown/popover menus use) portals into `container={useContainer()}` — the same ref'd element — not `document.body`. Since tldraw's CSS custom properties (spacing, color) are scoped to `.tl-container`/`.tl-theme__dark`, and portaled content is a *sibling* of any themed wrapper nested inside that element (not a descendant of it), the classes must sit on the container element itself for portaled menus to inherit them.
   - This created a second conflict: `.tl-container` sets `position: relative` in tldraw.css, which loads after Tailwind's utilities in this app's bundle and wins the cascade when both are classes on the same element (equal specificity, later rule) — silently discarding the `absolute inset-0` positioning this element also needs. Fixed by setting position via an inline `style` prop instead of a Tailwind class; inline styles always win over stylesheet rules regardless of cascade order, sidestepping the conflict entirely.

None of this amounts to "a hard dependency on the full `<Tldraw>` app" — the fallback path in the task that authorized this work (stop and report back if that turned out to be true) wasn't needed. It's three contexts/CSS scopes to satisfy instead of one, all discoverable from tldraw's own source and runtime errors, not from guesswork.

**Header symmetry (re-verified, not changed).** The task that authorized this pass described the PDF page nav as "centered across the full window" instead of within its own panel. Reading `PageShell`'s header markup (`app/components/PDFViewer.tsx`) and measuring live in the browser (nav content's bounding-box center vs. its containing section's bounding-box center) both showed they already match exactly, independent of window width — the per-panel centering built in Fix Pass II already satisfies this. No code changed here; documented in case this surfaces again, so the next pass doesn't have to re-derive the same conclusion.

**Collapsible sidebar (`app/components/Sidebar.tsx`).** Two modes now: expanded (unchanged 256px full list) and collapsed (48px icon rail: expand-toggle, new-notebook, notebook-switcher). The switcher is a floating popover listing every notebook by name; available in both modes (not just collapsed), closes on outside click, `Escape`, or selection. Preference persists to `localStorage` (`marginal:sidebarCollapsed`) — same pure-UI-state pattern as the resizable split (Fix Pass I) and this pass's own toolbar work, not routed through `src/storage/db.ts`. Rationale: Surface 3 already puts two panels on screen before the sidebar is counted; an always-expanded sidebar competes directly with that on laptop/tablet-sized viewports.

## Cross-Layer Drawing (2026-08-05)

A drag that starts on the PDF panel and crosses into the linked-canvas panel (or vice versa) renders as one continuous, unbroken stroke while drawing, then is split and stored as two linked segments once the drag completes. This is the milestone Fix Pass II and III's `activePanel`/`activeEditorRef` machinery was explicitly built to support (see those sections above).

**Two new files, deliberately separated:**
- `app/components/CrossLayerCapture.tsx` — the interactive overlay: a transparent capture strip, live SVG preview during the drag, and the pointer-event lifecycle (down/move/up/cancel).
- `app/components/crossLayerDrawing.ts` — pure(ish) logic: splitting a point list at the divider, converting screen points into a `line` shape via an editor's own `screenToPage()`, and reading/matching stroke style. Kept separate from the interactive component so the split/convert logic is unit-testable in isolation, per AGENTS.md §4.

**1. Screen-space capture overlay.** A transparent `<div>` (`CAPTURE_ZONE_WIDTH = 96px` wide) straddles the panel divider, absolutely positioned within the same relatively-positioned body-row container `PageShell` already uses for panel layout — `right: rightPanelWidth + DIVIDER_OFFSET_FROM_PANEL - CAPTURE_ZONE_WIDTH/2`, computed from the same layout values (`rightPanelWidth`, the `16px` divider footprint) as the real divider, not measured via a separate DOM query, so it can never drift out of alignment with the divider even mid-resize-drag.

- It only renders at all when the active editor's current tool is `"draw"` (`useValue` subscription on `activeEditorRef`, same reactive pattern Fix Pass II established for the toolbar's active-tool highlight) — any other tool, the strip doesn't mount, zero overhead.
- A drag that starts and stays entirely within one panel, outside this narrow strip, never touches this component at all — it hits that panel's own tldraw canvas directly, same as any other draw-tool stroke, satisfying the "don't add overhead to the common case" requirement.
- A drag that starts *inside* the strip (near the boundary) is captured here regardless of which side it ends up staying on or crossing into — buffered as a flat list of `{x, y}` screen points (`pointerdown` seeds the list; tracking then switches to **window-level** `pointermove`/`pointerup`/`pointercancel` listeners, not handlers bound to the strip element — see Fix Pass below for why).
- While dragging, an SVG `<polyline>` (`position: fixed; inset: 0`, `z-[600]`, above both panels and their tldraw content) renders the buffered points directly in screen space — this is what makes the stroke look continuous and unbroken across the boundary with no seam, independent of either panel's zoom/pan, since it isn't going through either editor's camera at all until release.

**2. Stroke splitting on pointer-up.** `splitPointsAtDivider(points, dividerX)` (`crossLayerDrawing.ts`) partitions the buffered screen points into `left`/`right` at the same divider x-coordinate the capture strip itself is centered on — order-preserving, so a drag that wobbles back and forth across the boundary still produces exactly one point list per side, matching the two-segment storage model (not one shape per crossing).

Each side's points are converted via `createLineShapeFromScreenPoints(editor, points, style, meta)`, which calls that editor's own `editor.screenToPage(point)` — **not** `src/canvas/coordinates.ts`. See [Coordinates § Cross-Layer Drawing: Resolving the Forward-Looking Note](./coordinates.md#cross-layer-drawing-resolving-the-forward-looking-note-above-2026-08-05) for the full reasoning; short version: tldraw's own camera already *is* the Transform for both the PDF panel (locked, so this is a fixed one-time conversion) and the canvas panel (live, so this reads whatever the camera is at release time) — introducing a second hand-rolled conversion path alongside it would just be two sources of truth for the same math.

Shapes are tldraw's `line` type (not `draw`) — chosen because `draw` shapes use a private, delta-encoded path format with no public encoder (confirmed by reading tldraw's source: `getPointsFromDrawSegments` only decodes), while `line` has a plain, publicly-constructible `points: Record<string, {id, index, x, y}>` structure. Point ordering uses `getIndices(n)` from `@tldraw/utils` for the fractional `index` keys tldraw's shape ordering expects.

**Style consistency.** Both segments of one cross-boundary stroke need to look like one gesture, not two independently-styled ones. `getCurrentLineStyle(editor)` is called exactly once, from whichever editor's panel the drag *started* in (`originPanelRef`, set on `pointerdown`), and that single `{color, dash, size}` is passed to both `createLineShapeFromScreenPoints()` calls — reading each editor's own `getStyleForNextShape()` independently would let the two halves pick up different current tool styles and visually read as two unrelated strokes.

**3. Storage — linked segments, not one unified element.** On a genuine crossing (both sides have ≥2 points), a shared `strokeGroupId` (`makeStrokeGroupId()`, timestamp + random suffix) is generated once and attached to both segments' `meta`:
- PDF-side segment: added to the page's own tldraw store (same store direct markup already uses), `meta: { canvasId: activeCanvasId, strokeGroupId }` — the `canvasId` tag is exactly what [Linked Canvases & Spillover](#linked-canvases--spillover-surface-3)'s `applySpilloverVisibility()` already keys off of, so this segment automatically follows the same show/hide-on-active-canvas-switch rule as any other canvas-tagged shape on the page, with zero new spillover logic needed.
- Canvas-side segment: added to the active Canvas's own tldraw store, `meta: { strokeGroupId }` only (a shape doesn't need to tag its own canvas).

If the drag never actually crosses (all points land on one side), a single plain shape is created on that side with no `strokeGroupId`/`canvasId` meta — indistinguishable from ordinary direct markup or a canvas stroke, which is correct: it isn't a cross-layer stroke.

**4. Accepted limitation — pan/zoom separation.** If the canvas panel is panned or zoomed after a cross-boundary stroke is drawn, the two segments visually separate: the PDF-side segment is anchored in the page's fixed coordinate space (camera locked, never moves), while the canvas-side segment is anchored in that Canvas's own live coordinate space (unlocked, moves with pan/zoom). This is expected, not a bug — locking the canvas panel's camera to prevent it would remove the Canvas's core pan/zoom functionality, which is required by every other feature built on that panel. Verified directly: drew a cross-boundary stroke, panned the canvas panel, confirmed the two halves separated exactly as described, with the PDF-side segment staying fixed and the canvas-side segment moving with the pan.

### Fix Pass — Stuck Drag State & Untagged Segments (2026-08-05)

Two real bugs surfaced from actual (non-automated) use, both traced to the same root cause.

**Symptom 1 — an unerasable tangle of scribble, visible only while the pen tool is active.** The original capture strip relied on `e.currentTarget.setPointerCapture(e.pointerId)` to keep receiving `pointermove`/`pointerup` once the drag left the strip's own 96px-wide bounds. In practice, a drag very quickly carries the pointer off the strip, and pointer capture is not reliable enough to guarantee the eventual `pointerup` still reaches an element-scoped handler (it can fail silently — this codebase's own earlier testing already hit a `NotFoundError` from it once, caught and ignored, which masked the deeper problem). When the `pointerup` never reached the strip, `finishDrag` never ran: `isDraggingRef` stayed `true` forever, and the strip kept a stale point buffer that every future `pointermove` over the strip — from unrelated later interactions — kept appending to, without ever clearing. The result rendered as the buffered-points SVG polyline, which is why it looked like an accumulating scribble tied to nothing: it was never a real shape, just leftover preview state. It vanished when switching tools only because the whole overlay unmounts when the active tool isn't `"draw"` — not because anything was cleaned up.

**Symptom 2 — PDF-side markup not hiding when the canvas tab switches.** Direct consequence of Symptom 1: since the drag never reached `finishDrag`, a genuine cross-boundary gesture never got split and tagged with `meta.canvasId`/`strokeGroupId` — nothing in the two-segment storage model (§3 above) ever actually got created for it. Spillover visibility (`applySpilloverVisibility`) was working correctly the whole time; there was simply nothing tagged for it to act on. Any effect the user saw as "PDF markup" was, in the failure state, either the leftover scribble (not a shape) or a plain untagged shape from a drag that appeared to cross but never completed correctly (`hasPdfSide`/`hasCanvasSide` computed from an incomplete point list) — either way, correctly always-visible per the direct-markup rule, since it was never actually tagged as canvas-linked in the first place.

**Fix:** stop depending on the strip element continuing to receive events. `handlePointerDown` now attaches `pointermove`/`pointerup`/`pointercancel` listeners directly to `window` for the duration of one drag (matched by `pointerId`), removed via a `finishDrag`-owned cleanup closure the moment the drag ends — wherever on screen that turns out to be. `setPointerCapture` is dropped entirely; it bought nothing the window listeners don't already guarantee, and removing it also removes the `NotFoundError` failure path. A `useEffect` cleanup handles the one remaining edge case (the component unmounts mid-drag, e.g. the tool changes away via a keyboard shortcut while dragging) by abandoning the in-progress drag — clearing state and listeners without creating a shape from a partial point list, rather than leaking listeners.

Re-verified after the fix (real off-strip releases, not just matched on/off-strip event pairs): a drag that starts on the strip and ends far outside it — on `document.body`, arbitrary distance away — now reliably reaches `finishDrag` every time, produces no leftover preview state, and correctly creates a tagged, spillover-visible pair when it's a genuine crossing.

**Verification performed (2026-08-05):** cross-boundary drag renders as one continuous unbroken stroke during drawing (confirmed visually); on release, splits into two `line` shapes sharing a `strokeGroupId`, correctly tagged (confirmed via direct IndexedDB inspection — page-side has `{canvasId, strokeGroupId}`, canvas-side has `{strokeGroupId}`); both segments persist correctly across a full reload, still aligned (neither camera had moved between drawing and reload); panning the canvas panel after drawing separates the two halves as documented, not hidden; switching the active canvas tab hides the PDF-side segment (same spillover rule as other canvas-tagged content) and switching back reshows it; a drag entirely within one panel (not crossing, and not even entering the capture strip) still draws normally via that panel's own tldraw instance with no regression; the shared floating toolbar/style panel, camera lock, and resizable split all still function correctly.

One methodology note for future verification of this feature: tldraw's IndexedDB persistence is debounced, not synchronous — reading the database immediately (within ~1 second) after a drag can show stale/empty results even though the shapes were created correctly in the editor's in-memory store and do get persisted shortly after. Wait at least 1–2 seconds before treating an empty IndexedDB read as a real failure.

## Storage Architecture

**IndexedDB via Dexie** is the only persistence layer for v1.

- **Schema** lives in `src/storage/types.ts` (TypeScript interfaces) and `src/storage/db.ts` (Dexie table definitions)
- **Data access** is behind a small interface (`src/storage/db.ts` exports functions, not direct table access)
- **Async handling** — all Dexie calls are async, but UI updates feel synchronous (optimistic updates)

**Future evolution:** When a backend exists, IndexedDB becomes a local cache. The data-access interface layer means swapping in a sync layer won't require rewriting every component.

## Build Order Constraints

The architecture enforces a strict build order. Why?

1. **Foundation** (current)
   - Coordinate transforms must be validated in isolation before any UI depends on them
   - If math is wrong here, every surface built on it misbehaves in hard-to-trace ways

2. **Surface 1 (Canvas)**
   - Builds on coordinate system
   - Nothing else depends on it

3. **Surface 2 (PDF)**
   - Builds on coordinate system
   - Standalone

4. **Surface 3 (Linked canvases)**
   - Builds on Surface 2 (needs working PDF pages to attach canvases to)

5. **Cross-layer drawing**
   - Depends on both Surface 2 and Surface 3 working
   - Splits strokes at panel boundary

If you try to build multiple surfaces at once, bugs become hard to trace. Build one, verify it works manually, then move to the next.

## Error Handling

- **Data layer errors** — logged to console, caught in try/catch, user sees degraded state (e.g., "Failed to load notebooks")
- **Hydration mismatches** — prevented via `suppressHydrationWarning` on html element and deferred rendering in AppContainer
- **Coordinate math** — not expected to fail (pure functions); if a point conversion breaks, it's a logic bug, not a runtime error

No user-facing error boundaries yet (v1). If something breaks, the page shows it (console for dev, blank/broken UI for user). This is acceptable for a personal tool; add error boundaries only when real failures surface.
