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

The switcher (☰) is available in **both** modes (also present in the expanded header, next to the collapse toggle) — it's a quick-jump popover, not exclusive to the collapsed rail. Clicking a notebook in it switches immediately and closes the popover; it closes on outside click or `Escape` too.

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

One row above the canvas: page nav (‹ Prev · Page N/M · Next ›) left-aligned, canvas tabs right-aligned. No divider to line up with anymore — this is a plain header, not a split layout. (Layout decision made alongside the migration; if a different arrangement is wanted later, this is a one-file change in `PageShell`, `app/components/PDFViewer.tsx`.)

### Canvas Tabs

Canvas tabs live in that header row, not a side panel:
- One tab per linked Canvas, "+" creates a new one (auto-focused)
- Clicking a tab sets `activeCanvasId` and toggles which tagged shapes are visible in the single shared store — it does **not** mount or unmount anything; the editor underneath never changes
- Switching tabs also saves the outgoing canvas's camera position and restores the incoming canvas's saved position (if it has one — a canvas that's never been active before just leaves the camera where it is). See [Data Model § Canvas](./data-model.md#canvas)
- Default names: "Canvas 0", "Canvas 1", etc.; double-click to rename
- Deleting a canvas removes its tagged shapes from the page; the last remaining canvas on a page can't be deleted

### Toolbar & Style Panel — tldraw's Own UI

Every PDF page and every Board now mounts a single, ordinary `<Tldraw>` instance with its stock UI showing (no `hideUi`, no externally-mounted toolbar) — the two-panel-era problem of "two tldraw instances both wanting to show their own chrome" doesn't exist anymore, since there's only ever one instance per surface.

Visual styling is still stock tldraw, not STYLING.md §5's custom floating pill — that visual treatment remains a genuine Polish-phase task.

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

## Keyboard Shortcuts (v1 Baseline)

| Key | Action | Mode |
|-----|--------|------|
| `v` | Select tool | Canvas/PDF |
| `p` | Pen tool | Canvas/PDF |
| `r` | Rectangle | Canvas/PDF |
| `t` | Text tool | Canvas/PDF |
| `e` | Eraser | Canvas/PDF |
| `h` | Highlighter | PDF only |
| `Cmd+B` | Toggle sidebar | Always (future) |
| `Cmd+Z` | Undo | Canvas/PDF |
| `Cmd+Shift+Z` | Redo | Canvas/PDF |

Extend as usage reveals friction (e.g., quick switcher `Cmd+K`).

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
