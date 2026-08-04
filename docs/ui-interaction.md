# UI & Interaction Design

Layout, navigation, and user interaction patterns.

## Top-Level Layout

```
┌─────────────────────────────────────────────┐
│ Sidebar (left)  │  Main Surface            │
│ Notebooks       │  (Canvas/PDF)    │Panel  │
│ Boards          │                  │(opt)  │
│ PDFs            │                  │       │
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

Future: `Cmd+B` toggles sidebar (currently always visible).

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

### Fixed Dimensions

PDF page rendered at native aspect ratio, matching source page dimensions. Non-resizable.

### Corner Button

Top-right of page, small + unobtrusive. Toggles right panel (linked canvases).

### Direct Markup

Tools (pen, shapes, text) draw directly on the page itself. Always available, regardless of right panel state.

### Toolbar Context

On PDF, toolbar scopes tools to either:
- Direct markup (on page)
- Active linked canvas (if right panel open)

Visual indicator shows which target is active.

## Linked Canvas Panel

### Appearance

Right side of screen. Slides in/out. Tabs at top.

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
