# UI & Interaction Design

Layout, navigation, and user interaction patterns.

## Top-Level Layout

**Revised 2026-08-07 (Single Canvas Migration — see [build-order.md](./build-order.md#single-canvas-migration)):** the right panel is gone. A PDF page is a single surface now, same shape as a Board — linked canvases are tabs in that surface's own header, not a second panel beside it.

```
┌─────────────────────────────────────────────┐
│ Sidebar (left)  │  Main Surface              │
│ Notebooks       │  (Board canvas, or a PDF   │
│ Boards          │   page — header + one      │
│ PDFs            │   shared canvas)           │
└─────────────────────────────────────────────┘
```

- **Sidebar** (left, collapsible): Persistent list of notebooks, boards, PDFs
- **Main surface** (center): Active board (canvas) or PDF page — both are exactly one tldraw instance, no split

## Navigation Model

### Opening a Notebook

Clicking a notebook in the sidebar:
1. Loads its Boards and PDFDocuments
2. Updates AppContainer active notebook state
3. Main surface shows "Select or create a board/PDF" empty state

### Opening a Board or PDF

Clicking a board or PDF:
1. Replaces main surface with Board (infinite canvas) or PDF (page viewer)
2. Sidebar highlights the active item
3. No modal dialogs (everything reachable via sidebar click + keyboard)

### No Back/Forward Navigation

This is not a file browser. Use sidebar to switch context. Keyboard shortcuts (future) for quick notebook switching.

## Sidebar Behavior

### Collapsible

**Built 2026-08-05.** The sidebar has two modes:

- **Expanded** (default, 256px): the full notebook list — create, inline rename, delete — unchanged from before.
- **Collapsed** (48px icon rail): three icon buttons — a toggle to re-expand, "+" to create a notebook, and a switcher (☰) that opens a floating popover listing every notebook by name to pick one to switch to.

**Fixed 2026-08-08:** the switcher (☰) is collapsed-mode only. It used to also render in the expanded header, next to the collapse toggle — redundant there, since the expanded sidebar already shows the full notebook list directly; the popover only earns its place when the list itself isn't on screen. Clicking a notebook in it switches immediately and closes the popover; it closes on outside click or `Escape` too.

**Rationale:** built when Surface 3 put two panels on screen (PDF page + linked canvas) before the sidebar was even counted, competing directly with an always-expanded 256px sidebar on a laptop or tablet-sized viewport. The single-canvas migration (2026-08-07) later removed that second panel, but the collapsed rail is still worth keeping — screen space is still finite. The collapsed/expanded preference persists to `localStorage` (`marginal:sidebarCollapsed`) — pure UI state, not app data, not routed through `src/storage/db.ts`.

`Cmd+B` as a keyboard shortcut for this toggle is still future work, not built here.

### Notebook List

- Flat list (no nesting)
- Hover reveals edit/delete buttons
- Rename inline (click pencil, type, press Enter or Escape)
- Delete requires confirmation dialog

### Active State

Currently selected notebook highlighted with subtle background (not bright accent).

## Toolbar (Floating Pill)

Present in Canvas and PDF modes. Bottom-center of screen.

```
    ┌─────────────────────┐
    │  [v] [p] [r] [t]    │
    └─────────────────────┘
```

- **Icon-only buttons** (no text labels)
- **Keyboard shortcuts** in hover tooltip
- **Active tool** indicated by subtle background or accent color (not both)
- **Responsive** (center stays bottom-center even with window resize)

### Tools

| Icon | Key | Mode | Purpose |
|------|-----|------|---------|
| v | v | Both | Select (move/edit existing elements) |
| p | p | Both | Pen (freehand drawing) |
| r | r | Both | Rectangle |
| t | t | Both | Text |
| e | e | Both | Eraser |
| h | h | PDF only | Highlighter (for PDF markup) |

### Context Switching

On Canvas: all tools available
On PDF: all tools draw into the single shared page canvas, auto-tagged with whichever canvas tab is active (see [PDF Page View](#pdf-page-view) below) — there's no separate "page vs. canvas" surface to route between anymore.

## PDF Page View

**Revised 2026-08-07 (Single Canvas Migration — see [build-order.md](./build-order.md#single-canvas-migration)):** everything in this section through "Linked Canvas Panel" below describes the pre-migration two-panel design and no longer reflects the app. Superseded, not deleted — see [Architecture](./architecture.md) for the historical Surface 3 / Fix Pass / Cross-Layer Drawing sections this corresponds to. What replaced it:

### One Surface, Free Camera

A PDF page is a single tldraw instance — the rendered page bitmap as a locked background image, plus every stroke ever drawn on that page, all in one store. There is no separate panel, no camera lock, no resizable split: pan/zoom freely, exactly like a Board (Surface 1). The page is fit-to-view once, the first time it's opened; after that, tldraw's own persisted session state remembers wherever the camera was left, across reloads.

### Header Row

One row above the canvas: page nav (‹ Prev · Page N/M · Next ›) left-aligned, canvas tabs right-aligned, followed by the export controls (see [Export](#export) below) — same row, no divider to line up with anymore, since this is a plain header, not a split layout. (Layout decision made alongside the migration; if a different arrangement is wanted later, this is a one-file change in `PageShell`, `app/components/PDFViewer.tsx`.)

### Canvas Tabs

Canvas tabs live in that header row, not a side panel:
- One tab per linked Canvas, "+" creates a new one (auto-focused)
- Clicking a tab sets `activeCanvasId` and toggles which tagged shapes are visible in the single shared store — it does **not** mount or unmount anything; the editor underneath never changes
- Switching tabs also saves the outgoing canvas's camera position and restores the incoming canvas's saved position (if it has one — a canvas that's never been active before just leaves the camera where it is). See [Data Model § Canvas](./data-model.md#canvas)
- Default names: "Canvas 0", "Canvas 1", etc.; double-click to rename
- Deleting a canvas removes its tagged shapes from the page; the last remaining canvas on a page can't be deleted

### Toolbar & Style Panel — tldraw's Own UI

Every PDF page and every Board now mounts a single, ordinary `<Tldraw>` instance with its stock UI showing (no `hideUi`, no externally-mounted toolbar) — the two-panel-era problem of "two tldraw instances both wanting to show their own chrome" doesn't exist anymore, since there's only ever one instance per surface.

Visual styling is still stock tldraw, not STYLING.md §5's custom floating pill — that visual treatment remains a genuine Polish-phase task (the one Polish deliverable still deferred — see [build-order.md](./build-order.md)).

## Export

Added in the Polish milestone (`app/components/export.ts`, `app/components/pdfExport.ts`, `app/components/ExportMenu.tsx`). All client-side — no server round-trip, per AGENTS.md § 1.

- **Board:** an "Export" control in the Board's own header row (above the canvas, added by `Editor.tsx`) offers PNG or SVG via tldraw's own `exportAs`, covering every shape on the board (auto-trimmed to content bounds — a Board has no fixed page size to bound against).
- **PDF page:** an "Export page" control in the page header (`PageShell`) offers PNG or SVG of that page only — the rendered PDF background plus the *currently-visible* canvas's ink (tag-based visibility, same shapes the user sees on screen), bounded explicitly to the page's own PDF-point dimensions rather than auto-trimmed, since canvas ink can extend anywhere on the shared infinite canvas.
- **Full PDF document:** an "Export PDF" control in the same page header reassembles every page of the PDFDocument into one downloadable PDF (pdf-lib), each page baked with whatever canvas was active on it — including pages not currently open, rendered headlessly by briefly mounting a throwaway, off-screen `<Tldraw>` instance against that page's real `persistenceKey` (same store, so the same tag-based visibility already applies) and rasterizing it to PNG before embedding.
- The style-format popover (PNG/SVG) is a small custom component (`ExportMenu`) — this is app chrome, not a restyle of tldraw's own toolbar/style panel, which stay stock per the Polish scope boundary.

## Search

Added in the Polish milestone. Name-only, across Notebooks, Boards, and PDFDocuments — not a content search (searching inside board/page ink would mean digging into tldraw stores per item, meaningfully harder and out of scope). Bound to **Cmd+K**, opens a centered palette (`SearchPalette.tsx`, mounted at the `AppContainer` level so it can jump across notebooks): debounced text input, results grouped by type, click or Enter jumps straight to that Notebook/Board/PDF. Deliberately separate from the Sidebar's collapsed-rail switcher (§ Sidebar Behavior), which stays a simple, mouse-driven, notebook-only affordance.

## Empty States

### New Notebook

Shows:
```
Select or create a notebook to get started
```

With affordances to create Board or import PDF (future).

### New Board

Opens directly in infinite canvas. Default name: "Untitled Board — Aug 4", renamed later.

### New PDF Page

Auto-creates Canvas 0 as active. No intermediate steps.

## Keyboard Shortcuts (Final — Polish Milestone)

**Revised 2026-08-08 (Polish milestone):** the original v1 baseline table below was drafted before checking tldraw's actual bindings and got two of them wrong — there is no native `p` shortcut at all (the freehand tool is `d`/`b`/`x`, not `p`), and `h` is the hand/pan tool, not a highlighter (highlight is `shift+d`). This table reflects what tldraw 5.2.5 actually binds (confirmed against `node_modules/tldraw/src/lib/ui/hooks/useTools.tsx` and `useKeyboardShortcuts.ts`), plus every app-specific shortcut added in Polish. All app-specific shortcuts were chosen to avoid colliding with a tldraw native — verified by checking exact modifier combinations, not just the bare key, since a modified and unmodified version of the same key are different bindings.

**Native, from tldraw (unchanged by us):**

| Key | Action |
|-----|--------|
| `v` | Select tool |
| `h` | Hand (pan) tool |
| `e` | Eraser tool |
| `d`, `b`, or `x` | Draw (freehand/pen) tool |
| `r` | Rectangle |
| `o` | Ellipse |
| `a` | Arrow |
| `l` | Line |
| `f` | Frame |
| `t` | Text tool |
| `n` | Note (sticky) |
| `k` | Laser pointer |
| `shift+d` | Highlight |
| `cmd+u` | Insert media |
| `cmd+z` | Undo |
| `cmd+shift+z` | Redo |

**App-specific, added in Polish (`app/components/keyboardShortcuts.ts` + per-component effects):**

| Key | Action | Collision check |
|-----|--------|------|
| `Cmd+B` | Toggle sidebar collapse | tldraw only binds plain `b` (draw tool alias) — a modified `cmd+b` is untouched |
| `Cmd+[` / `Cmd+]` | Previous / next PDF page | tldraw only binds plain `[`/`]` and `alt+[`/`alt+]` (shape reordering) |
| `Cmd+Shift+[` / `Cmd+Shift+]` | Previous / next canvas tab | tldraw has no `shift+bracket` binding at all |
| `Cmd+K` | Open search palette | tldraw only binds plain `k` (laser pointer) |

All four are guarded against firing while typing into a text field (renaming a notebook/board/canvas, editing the search query) via `isTypingTarget` — same guard shape as tldraw's own `shouldSkipEvent`. `Cmd+K` is the one exception, deliberately: like most apps' quick-open shortcuts, it fires even while another input has focus.

## Drag & Drop (Future)

- Drag PDF file to upload
- Drag notebook to reorder (sidebar)
- Drag canvas tab to reorder

Currently not implemented.

## Touch & Mobile (Future, Not v1)

Marginal is desktop-first. Mobile/touch support deferred (non-goal).

## Accessibility (Future, Not v1)

- Keyboard navigation (sidebar)
- Screen reader labels
- High contrast mode support

Currently basic. Improve if actual users need it.

## Error States

### Failed to Load Notebooks

```
Sidebar shows: "Failed to load notebooks"
Button: "Retry"
```

### Delete Failed

```
Dialog overlay: "Failed to delete notebook. Try again?"
Buttons: "Retry" / "Cancel"
```

### Corrupted Data

Not expected in v1 (local, single-user). If it happens, surface error in console and UI.

## Responsive Behavior

### Small Screens (< 800px)

Future: Sidebar collapses to icons. (Not v1.)

### Large Screens

Sidebar full width, content flows normally.

### Sidebar Width

Fixed at 16rem (256px) in v1. Future: user-resizable.

## Animation & Transitions

Minimal animations (per STYLING.md restrained aesthetic):

- Hover state: background color change (smooth, 200ms)
- Sidebar item active: background change (instant)
- Right panel open/close: slide-in/out (future, 300ms)
- Toolbar hover: subtle background (200ms)

No page transitions, no elaborate entrance/exit animations.

## Color & Contrast

See STYLING.md for colors. Ensure 4.5:1 contrast ratio for text (AA accessibility minimum, even if not strictly tested).

## Internationalization (Future, Not v1)

All text currently hardcoded English. No i18n framework set up. If multi-language needed, add later.
