# Architecture

Marginal's system design and how components interact.

## System Overview

```
┌─────────────────────────────────────────────────────┐
│  React App (Next.js App Router, client-only)       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐         ┌────────────────────┐   │
│  │   Sidebar    │─────────│  AppContainer      │   │
│  │              │         │  (state, routing)  │   │
│  └──────────────┘         └────────────────────┘   │
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
     │   └── DeleteConfirmationDialog (overlay)
     └── Main surface (state-driven: notebook → contents → item)
         ├── (no notebook selected) → empty state
         ├── (notebook selected, nothing open) → NotebookContents
         │    │  (boards + PDFs together: create board, import PDF,
         │    │   rename/delete either — per UI navigation model)
         │    └── DeleteConfirmationDialog (overlay)
         ├── (board open) → Editor
         │    └── tldraw instance (persistenceKey `board-${boardId}`)
         └── (PDF open) → PDFViewer
              ├── page nav bar (single-page view, prev/next)
              └── PageShell (one per page, keyed by pageId)
                   ├── PageMarkupEditor
                   │    └── tldraw instance (persistenceKey `page-${pageId}`) —
                   │        direct markup + background + spillover shapes
                   ├── corner button (toggles right panel)
                   └── (panel open) → RightPanel
                        ├── tab bar (one per linked Canvas, "+" to create)
                        └── tldraw instance for the active canvas
                             (persistenceKey `canvas-${canvasId}`)
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

**Shared Capsule toolbar (`app/components/Capsule.tsx`).** Both the PDF panel's `Tldraw` and the linked-canvas panel's `Tldraw` now mount with `hideUi` unconditionally — neither ever shows its own chrome. `Capsule` is the only toolbar, rendered once by `PageShell`, positioned `absolute bottom-4 left-1/2 -translate-x-1/2` relative to the split container (so it's centered over whichever panels are currently visible — just the PDF panel when closed, both combined when open — not the whole browser viewport, which would misalign it against the sidebar). Buttons: select, pen (draw), rectangle (geo), text, eraser, undo, redo — the STYLING.md §5 tool list plus undo/redo, styled minimally (dark pill, visible active state) with full visual treatment deferred to Polish.

**Active-editor routing.** `PageShell` holds `activeEditorRef` (a `RefObject<Editor | null>`) plus an `activeEditorVersion` counter used purely to force React to re-run the Capsule's reactive subscription when the ref's target changes (a plain ref mutation doesn't trigger a re-render on its own). `activePanel: 'page' | 'canvas'` — the same state introduced in Fix Pass I — is set via `onPointerEnter` on each panel's wrapper div; an effect re-points `activeEditorRef.current` to whichever editor (`pageEditor` or `canvasEditor`) corresponds to `activePanel` and bumps the version whenever the target actually changes (including when the canvas panel remounts a new `Tldraw` instance on tab switch while the pointer is still over it). Every Capsule button reads `activeEditorRef.current` at click time — never a closed-over editor — so it always targets whichever panel the cursor last entered. The Capsule's active-tool highlight uses `useValue` from `@tldraw/state-react` with `[activeEditorRef, version]` as deps, so it both re-subscribes when the target editor changes and reactively reflects that editor's `currentToolId` changing.

**This is shared groundwork, not a toolbar-only fix.** Cross-layer drawing (next milestone) needs exactly this signal — which panel the pointer is in — to know whether a drag is starting on the PDF page or in the active linked canvas, so it can route the drag's coordinates into the right space and, on crossing the panel boundary, split the stroke into its two tagged segments (see [Linked Canvases & Spillover](#linked-canvases--spillover-surface-3)). `activePanel`/`activeEditorRef` from this fix pass is that mechanism, not a new one to be built next milestone.

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
