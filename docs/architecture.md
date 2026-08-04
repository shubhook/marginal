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
     └── Main surface (state-driven: notebook → boards → board)
         ├── (no notebook selected) → empty state
         ├── (notebook selected, no board open) → BoardList (board list, CRUD)
         │    └── DeleteConfirmationDialog (overlay)
         └── (board open) → Editor
              └── tldraw instance (persistenceKey scoped to `board-${boardId}`)
```

**Note on this hierarchy:** an earlier pass scoped the tldraw `persistenceKey` directly to `notebookId`, which collapsed Notebook → Board → Canvas into Notebook → Canvas — a notebook could only ever hold one implicit canvas, not multiple named boards. This was corrected: `AppContainer` now tracks `activeBoardId` alongside `activeNotebookId`, selecting a notebook shows `BoardList` (not a canvas), and only opening a specific board mounts `Editor` with a `board-${boardId}` persistence key. This matches the entity hierarchy described above and in [Data Model](./data-model.md).

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
