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
              └── PageMarkupEditor (one per page, keyed by pageId)
                   └── tldraw instance (persistenceKey `page-${pageId}`)
```

**Note on this hierarchy:** an earlier pass scoped the tldraw `persistenceKey` directly to `notebookId`, which collapsed Notebook → Board → Canvas into Notebook → Canvas — a notebook could only ever hold one implicit canvas, not multiple named boards. This was corrected: `AppContainer` tracks an `activeItem` (`board` or `pdf`) alongside `activeNotebookId`, selecting a notebook shows `NotebookContents` (not a canvas), and only opening a specific item mounts its editor. This matches the entity hierarchy described above and in [Data Model](./data-model.md).

## PDF Rendering & Direct Markup (Surface 2)

**Decided implementation (2026-08-04):**

- **Page navigation: single-page view with prev/next buttons** (not vertical scroll). One tldraw instance is mounted at a time, keyed by pageId, which keeps every page's markup store isolated and mirrors the board pattern exactly. Vertical scroll was the rejected alternative — it would require many simultaneous tldraw instances or a custom unified surface, neither justified for v1.
- **Rendering pipeline:** `src/pdf/pdfjs.ts` loads PDF.js lazily via dynamic import (PDF.js touches browser globals at module scope, so a static import would break Next's SSR pass even in client components). `src/pdf/renderer.ts` caches the parsed document per PDFDocument and the rendered bitmap per Page (2× oversampled PNG with the 1px `border-subtle` page outline baked in).
- **Coordinate model:** the rendered page bitmap is inserted **inside** the page's tldraw instance as a locked image shape at (0,0) sized to the page's native PDF-point dimensions. PDF-page space and tldraw page space are therefore **identical by construction** — a stroke at tldraw (x, y) is at PDF point (x, y), and the tldraw camera plays the role of the `Transform` from `src/canvas/coordinates.ts` (`pdfToWorld`/`worldToPdf` with the identity page placement). Pan/zoom moves page and markup together, so markup can never drift relative to the page, and no new coordinate math exists anywhere in the PDF path.
- **Bitmap persistence:** the background image shape (deterministic id `pdfbg-${pageId}`) and its asset persist in the page's tldraw store, so a page is re-rendered by PDF.js only if its store doesn't already contain the background (first open), not on every visit.

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
