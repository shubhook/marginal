# UI & Interaction Design

Layout, navigation, and user interaction patterns.

## Top-Level Layout

```
┌─────────────────────────────────────────────┐
│ Sidebar (left)  │  Main Surface             │
│ Notebooks       │  (Canvas/PDF)    │Panel   │
│ Boards          │                  │(opt)   │
│ PDFs            │                  │        │
└─────────────────────────────────────────────┘
```

- **Sidebar** (left, collapsible): Persistent list of notebooks, boards, PDFs
- **Main surface** (center): Active board (canvas) or PDF page
- **Right panel** (optional): Linked canvas tabs (only when PDF with canvases open)

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

**Rationale:** Surface 3 already puts two panels on screen (PDF page + linked canvas) before the sidebar is even counted. An always-expanded 256px sidebar competes directly with that on a laptop or tablet-sized viewport, so collapsing it to a rail is a real space-usability need, not a nice-to-have. The collapsed/expanded preference persists to `localStorage` (`marginal:sidebarCollapsed`) — pure UI state, not app data, same pattern as the resizable split (§ PDF Page View below) and not routed through `src/storage/db.ts`.

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
On PDF: pen/shapes/text draw to page OR active canvas (see below)

## PDF Page View

### Fixed Dimensions & Camera Lock

The PDF page's own content (the rendered bitmap) is at native aspect ratio, matching source page dimensions. **Fixed 2026-08-05:** the panel is a locked, fixed viewer, not a second pannable canvas — after the initial fit, drag-pan, wheel/pinch-zoom, and keyboard zoom shortcuts are all disabled on the PDF panel specifically (tldraw's camera-options `isLocked`). The whole page always stays visible, letterboxed on whichever axis has slack if the panel's aspect ratio doesn't match the page's (`fit-min` — see [Architecture § Camera Lock](./architecture.md#surface-3-fix-pass-ii--shared-capsule-camera-lock-header-alignment-2026-08-05) for the full rationale and why `fit-max` — which would crop the page — was rejected). Drawing/markup interaction is unaffected; only camera movement is locked. The linked-canvas panel keeps a normal, fully free camera.

### Bounded Panel & Resizable Split

**Fixed 2026-08-04** (was a bug: the PDF page previously rendered full-bleed as if it were the entire canvas surface, with no visible container). The PDF page and the linked-canvas panel each render inside a distinct, bordered container (`border-subtle`, 1px, `overflow: hidden`, per STYLING.md §7) with a small inset from the app-shell background, so each reads as a panel rather than as the whole surface.

When the right panel is open, a draggable divider sits between the two panels:
- Drag to resize; both sides respect a minimum width (PDF panel: 360px, canvas panel: 260px) so neither can be dragged to zero.
- The divider is a thin hit-target that highlights on hover/drag; cursor becomes `col-resize`.
- The split position is pure UI state, not app data — persisted to `localStorage` (`marginal:rightPanelWidth`), not through the Dexie data-access layer. It survives reloads but is not part of any entity.
- Resizing the PDF panel re-fits its (locked) camera automatically to the new width — the page never looks mis-framed after a drag.

### Unified Header Row

**Fixed 2026-08-05** (was a bug: the PDF page nav and the canvas tab bar rendered as two separate strips at different heights). Both now render in one row, same height, text baseline-aligned: page nav (‹ Prev · Page N/M · Next ›) on the left, canvas tabs on the right when the panel is open. The row's left/right split lines up exactly with the panel divider beneath it, including while dragging.

**Per-panel symmetry:** the page nav is centered *within its own panel's width* (the left section of the header row), not across the full window — and canvas tabs stay left-aligned within their panel, matching normal tab-bar convention (tabs are never centered). This was re-verified (2026-08-05) by measuring the nav's content bounding box against its section's bounding box directly in the browser — they share the same center point, confirmed independent of window width. If this ever looks off in practice, check `PageShell`'s header row markup in `PDFViewer.tsx` first (the left section is a `flex-1` div with `justify-center`, matching the same width formula as the PDF panel below it) before assuming new work is needed.

### Corner Button

Top-right of the PDF panel, small + unobtrusive. Toggles right panel (linked canvases).

### Direct Markup

Tools (pen, shapes, text) draw directly on the page itself. Always available, regardless of right panel state.

### Toolbar & Style Panel — tldraw's Own UI, Shared

**Fixed 2026-08-05, replacing a hand-built minimal toolbar** (the "Capsule": select/pen/rectangle/text/eraser/undo/redo only, built one pass earlier to solve the two-toolbars-at-once bug). That reduced set silently dropped real functionality — no color/fill/dash/size style panel, no hand tool, arrow, sticky note, image upload, or more-tools overflow. Rebuilding those individually wasn't worth it, so this pass swaps in tldraw's *actual* `DefaultToolbar` and `DefaultStylePanel` components instead, re-bound to whichever panel is active.

Both the PDF panel and the linked-canvas panel always mount with tldraw's UI hidden entirely (`hideUi`). The **only** chrome on screen is:
- The real tldraw toolbar — bottom-center, spanning the split view (both panels combined when open, just the PDF panel when closed — not the whole browser window). Full native tool set: select, hand, pen, eraser, arrow, text, sticky note, image, shapes (rectangle/ellipse/triangle/diamond/star/etc.), laser, highlighter, frame, with the same "more tools" overflow behavior as stock tldraw.
- The real tldraw style panel — top-right of the split view, offset below the corner button. Full color/fill/dash/size controls, same as stock tldraw.

Every action targets whichever panel's editor the pointer most recently entered — `activePanel: 'page' | 'canvas'`, the same tracking concept from the earlier fix pass, now driving which editor these shared components are bound to (via React context) instead of `hideUi` toggling. Both the active-tool highlight and the style panel's values update live to match whichever panel has focus.

This is not a one-off UI patch: cross-layer drawing (next milestone) reads the same tracking to know which panel a drag started in. See [Architecture § Shared Toolbar & Style Panel](./architecture.md#surface-3-fix-pass-iii--tldraws-own-ui-collapsible-sidebar-2026-08-05).

Visual styling is still stock tldraw, not STYLING.md §5's custom floating pill — that visual treatment (final icon set, exact spacing/shadow) remains a genuine Polish-phase task. What's built now is the *architecture* that makes a shared, cross-panel toolbar possible at all.

## Linked Canvas Panel

### Appearance

Right side of screen, inside its own bordered panel next to the PDF panel (see Bounded Panel & Resizable Split above). Slides in/out via the corner button. Tabs render in the unified header row (see above), aligned with the PDF page nav.

### Tab Behavior

- One tab per linked Canvas
- "+" tab creates new canvas (auto-focused)
- Clicking tab sets it as active (changes spillover on PDF page)
- Tab order matches Canvas order field
- Active tab marked with accent underline (not filled background)

### Canvas List

Default names: "Canvas 0", "Canvas 1", etc. (user-editable via future rename UI).

### Closing

Right panel close button hides panel, does not delete canvases.

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
