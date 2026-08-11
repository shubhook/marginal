# Data Model

Complete schema and entity relationships.

## Entity Relationships

```
Notebook (flat container)
  ├── Board (infinite canvas, standalone)
  └── PDFDocument
       └── Page (one per PDF page — fixed PDF background, single
            shared infinite tldraw canvas on top)
            └── Canvas[] (named ink layers over that shared canvas,
                 1 to many — tag-based, not separate stores)
                 └── activeCanvasId (which tag's shapes are visible)
```

## Entities

### Notebook

Top-level organizational unit. Flat (no nesting).

```typescript
interface Notebook {
  id: string;                // Unique identifier
  name: string;              // Display name (editable)
  order: number;             // Sort order in sidebar
  deletedAt: number | null;  // Soft-delete marker (v4) — see § Trash
  createdAt: number;         // Unix timestamp (ms)
  updatedAt: number;         // Last modification time
}
```

**Invariants:**
- Every notebook has a unique ID
- Name can be empty string (though UI should prevent this)
- Order is user-controlled (sidebar drag-to-reorder — see § Reordering)

**Lifecycle:**
- Create: `createNotebook(name)` → returns Notebook, `deletedAt: null`
- Read: `getNotebook(id)` (any state) or `getNotebooksList()` → non-deleted notebooks ordered by order field
- Update: `updateNotebook(id, updates)` → patch fields, auto-updates `updatedAt`
- Soft-delete: `softDeleteNotebook(id)` → sets `deletedAt`, cascades the same timestamp to any not-already-deleted child Boards/PDFDocuments — see § Trash
- Restore: `restoreNotebook(id)` → clears `deletedAt`, cascades restore to children soft-deleted at the same timestamp
- Permanently delete: `permanentlyDeleteNotebook(id)` → the real cascade-delete (removes Boards, PDFDocuments, Pages, Canvases, pdfFiles, and every associated tldraw store) — only reachable from the Trash view

### Board

Infinite canvas attached to a notebook. No PDF.

```typescript
interface Board {
  id: string;                // Unique identifier
  notebookId: string;        // Parent notebook
  name: string;              // Display name (editable)
  order: number;             // Sort order within notebook
  deletedAt: number | null;  // Soft-delete marker (v4) — see § Trash
  createdAt: number;
  updatedAt: number;
}
```

**Invariants:**
- Every board belongs to exactly one notebook
- Order field is user-controlled (drag-to-reorder — see § Reordering)

**Lifecycle:**
- Create: `createBoard(notebookId, name)` → new board, next order value, `deletedAt: null`
- Read: `getBoard(id)` (any state) or `getBoardsByNotebook(notebookId)` → non-deleted boards ordered by order
- Update: `updateBoard(id, updates)` → rename, change order
- Reorder: `reorderBoards(orderedIds)` → reassigns sequential `order` values in the given order
- Soft-delete: `softDeleteBoard(id)` → sets `deletedAt` (no children to cascade to — a Board's content lives entirely in its own tldraw store, not as Dexie rows)
- Restore: `restoreBoard(id)` → clears `deletedAt`
- Permanently delete: `permanentlyDeleteBoard(id)` → removes the board row **and** its tldraw store (`board-${id}`), so strokes don't orphan — only reachable from the Trash view

**Implementation status:** fully wired as of 2026-08-04 — `app/components/BoardList.tsx` renders when a Notebook is selected (create/rename/delete boards), and `app/components/Editor.tsx` mounts a tldraw instance scoped to `board-${boardId}` only once a specific board is opened. (An earlier revision skipped this — the Editor mounted directly off `notebookId`, collapsing Notebook→Board→Canvas into Notebook→Canvas. See [Architecture](./architecture.md#component-tree) for the corrected component tree.)

**Content storage:**
- Strokes, shapes, text: Managed by tldraw, persisted separately (not in Dexie in v1)

### PDFDocument

PDF file attached to a notebook. Contains pages.

```typescript
interface PDFDocument {
  id: string;                // Unique identifier
  notebookId: string;        // Parent notebook
  name: string;              // Display name (editable)
  fileName: string;          // Original file name (for download/export)
  order: number;             // Sort order within notebook (v4) — see § Reordering
  deletedAt: number | null;  // Soft-delete marker (v4) — see § Trash
  createdAt: number;
  updatedAt: number;
}
```

**Invariants:**
- Every PDF belongs to exactly one notebook
- fileName preserved for export/reference (not currently used)
- Order field is user-controlled (drag-to-reorder — see § Reordering); before v4, PDFs were listed by `createdAt` instead — the v4 migration backfills `order` from existing creation order so the first reorder has a sane starting point

**Lifecycle:**
- Create: `createPDFDocument(notebookId, name, fileName)` → new PDF, initially no pages, next order value, `deletedAt: null`
- Read: `getPDFDocument(id)` (any state) or `getPDFsByNotebook(notebookId)` → non-deleted PDFs ordered by order
- Update: `updatePDFDocument(id, updates)` → rename
- Reorder: `reorderPDFDocuments(orderedIds)` → reassigns sequential `order` values in the given order
- Soft-delete: `softDeletePDFDocument(id)` → sets `deletedAt`. Its Pages/Canvases are **not** touched — see § Trash — Page and Canvas decision
- Restore: `restorePDFDocument(id)` → clears `deletedAt`
- Permanently delete: `permanentlyDeletePDFDocument(id)` → the real cascade-delete (Pages, Canvases, pdfFiles, tldraw stores) — only reachable from the Trash view

**Content storage:**
- PDF file: raw bytes in the `pdfFiles` table (see below), keyed by `pdfDocumentId`
- Page images: rendered on demand via PDF.js and cached (in-memory per session, and as the persisted background shape in each page's tldraw store)

**Implementation status:** fully wired as of 2026-08-04 (Surface 2) — `NotebookContents` lists PDFs alongside boards with import/rename/delete, `importPdfFile()` (src/pdf/importPdf.ts) creates the PDFDocument + one Page per source page with dimensions read from each page's viewport, and `PDFViewer` renders pages with a per-page markup layer.

### PDFFile

Raw PDF bytes, stored separately from `PDFDocument` metadata so listing PDFs in the sidebar never loads file contents. Added in Dexie schema **version 2**.

```typescript
interface PDFFile {
  pdfDocumentId: string;     // Primary key; 1:1 with PDFDocument
  data: ArrayBuffer;         // The original imported file bytes
}
```

**Lifecycle:**
- Create: `savePDFFile(pdfDocumentId, data)` during import
- Read: `getPDFFile(pdfDocumentId)` when the renderer first needs the document in a session
- Delete: removed inside the `deletePDFDocument` / `deleteNotebook` cascades

### Page

One page from a PDF. Fixed dimensions matching source page.

```typescript
interface Page {
  id: string;                // Unique identifier
  pdfDocumentId: string;     // Parent PDF
  pageNumber: number;        // 0-indexed page number
  width: number;             // Page width in PDF units (e.g., 612 for US Letter)
  height: number;            // Page height in PDF units (e.g., 792)
  activeCanvasId: string | null; // Which canvas's spillover is visible
  createdAt: number;
  updatedAt: number;
}
```

**Invariants:**
- Every page belongs to exactly one PDF
- Width/height are immutable (from source PDF)
- activeCanvasId always points to an existing Canvas (never null; Canvas 0 auto-created)
- pageNumber is immutable

**Lifecycle:**
- Create: `createPage(pdfDocumentId, pageNumber, width, height)` → auto-creates Canvas 0 as active
- Read: `getPage(id)` or `getPagesByPDF(pdfDocumentId)` → ordered by pageNumber
- Update: `updatePage(id, updates)` → only updates activeCanvasId (to switch which canvas's spillover shows)
- Delete: `deletePage(id)` → cascades to all Canvases. Hard-delete only — Page does **not** get a `deletedAt` field; see § Trash — Page and Canvas decision

**Content storage:**
- Direct markup: strokes live in the page's own tldraw store (persistenceKey `page-${pageId}`), in PDF-page coordinates — see [Architecture § PDF Rendering](./architecture.md#pdf-rendering--direct-markup-surface-2). Deleted along with the page (`deletePage`/cascades remove the tldraw store too).
- Spillover from the active canvas: also lives in this same store, tagged with `meta.canvasId` — see [Canvas § Spillover behavior](#canvas) and [Architecture § Linked Canvases & Spillover](./architecture.md#linked-canvases--spillover-surface-3).

**Implementation status:** wired as of 2026-08-04 (Surface 2, extended Surface 3) — pages are created at import with per-page source dimensions, rendered in `PDFViewer` (single-page view, prev/next), each with its own markup layer. Canvas 0 is auto-created per the invariant above; Surface 3 added the corner button + right panel that surfaces it (and any additional linked canvases) in the UI.

### Canvas

A named ink layer over a page's single shared infinite canvas. Not a separate tldraw instance — canvases are a tagging/visibility concept, not a storage or coordinate-space concept.

```typescript
interface Canvas {
  id: string;
  pageId: string;
  name: string;
  order: number;
  isActive: boolean;
  lastCameraPosition: {
    x: number;
    y: number;
    z: number;               // zoom level
  } | null;                  // null until this canvas has ever been active
  createdAt: number;
  updatedAt: number;
}
```

**Invariants:**
- Every canvas belongs to exactly one page
- Exactly one canvas per page has `isActive: true`
- `lastCameraPosition` is `null` only for a canvas that's never been the active one

**Lifecycle:** `createCanvas`, `createCanvasAndActivate`, `getCanvas`/`getCanvasesByPage`, `updateCanvas`, `setActiveCanvas`, `deleteCanvas`. `setActiveCanvas` reads the target canvas's `lastCameraPosition` and, if non-null, applies it via `editor.setCamera()`; if null (first visit), leave the camera wherever it currently is. `reorderCanvases(orderedIds)` (v4 — see § Reordering) reassigns sequential `order` values for a page's canvas tabs, same pattern as `reorderBoards`/`reorderPDFDocuments`. `deleteCanvas` is hard-delete only — Canvas does **not** get a `deletedAt` field; see § Trash — Page and Canvas decision.

**Content storage:**
- There is exactly one tldraw store per Page (`page-${pageId}`). Every shape drawn — former "direct markup," former "spillover" — lives in this single store as an ordinary tldraw shape.
- Every shape is tagged `meta.canvasId` at creation time, set to whichever canvas is active when the shape is drawn.
- Visibility is enforced by canvasId: on every `activeCanvasId` change, shapes tagged with the new active canvas's id become visible, all others are hidden. Same mechanism `spillover.ts` already implements, now applied to all markup instead of a subset.
- The PDF page background image (`pdfbg-${pageId}`) is tagged `meta.canvasId: null` (reserved sentinel) and is always visible regardless of active canvas.

**What replaces "spillover":** the term described markup that lived on the PDF page but belonged to a specific linked canvas, distinguished from "direct markup" belonging to no canvas. That distinction collapses under this model — everything drawn belongs to whichever canvas is active at draw-time. There is no separate "direct markup" category.

## Cross-Layer Strokes (removed 2026-08-07)

A prior architecture (two separate tldraw instances — PDF panel and linked-canvas panel) required splitting a drawn stroke into two linked segments at the panel boundary. This is no longer applicable: with a single shared canvas per page (see [Canvas](#canvas)), there is no panel boundary and no coordinate-space mismatch to reconcile. A stroke drawn across what used to be the panel divider is now just one ordinary shape, tagged with whichever canvas is active — same as any other markup.

## Trash (Soft-Delete) — added v4 (2026-08-11)

Notebook, Board, and PDFDocument each carry a `deletedAt: number | null` field. Deleting one of these three from normal UI (Sidebar, `NotebookContents`) sets `deletedAt` to the current timestamp instead of removing the row — the item disappears from every normal list/query (`getNotebooksList`, `getBoardsByNotebook`, `getPDFsByNotebook`, `searchAll`) but still exists, listed instead in the Trash view (`getTrashedItems()`).

**Cascade on delete:** soft-deleting a Notebook also soft-deletes (with the identical timestamp) any of its Boards/PDFDocuments that aren't already trashed. Soft-deleting a Board or PDFDocument on its own has no further cascade — see § Page and Canvas decision below.

**Restore:** `restoreNotebook`/`restoreBoard`/`restorePDFDocument` clear `deletedAt`. Restoring a Notebook also restores any child whose `deletedAt` matches the Notebook's own (i.e. was cascade-deleted alongside it) — a child that was trashed independently, before or after, keeps its own trashed state and isn't pulled back by the parent's restore. (Matching is millisecond-precision — see the comment on `softDeleteNotebook` in `src/storage/db.ts` for the one theoretical edge case this doesn't cover, which requires two delete calls to land in the same millisecond and isn't reachable from two separate user actions.)

**Permanent delete:** `permanentlyDeleteNotebook`/`permanentlyDeleteBoard`/`permanentlyDeletePDFDocument` are the real cascade-delete — identical to the pre-v4 `deleteNotebook`/`deleteBoard`/`deletePDFDocument` logic (rows removed, tldraw stores deleted), only reachable from the Trash view's "Delete Forever" action, reused as-is rather than rewritten.

**Page and Canvas decision:** Page and Canvas deliberately do **not** get a `deletedAt` field or their own soft-delete/restore functions — `deletePage`/`deleteCanvas` remain hard-delete-only, unchanged by this milestone. When a PDFDocument is soft-deleted, its Pages/Canvases are left as ordinary, untouched rows — they simply become unreachable through normal UI (nothing queries them until the PDF is opened again, and a trashed PDF can't be opened), with no need for a parallel soft-delete concept two levels down. They're only actually removed when the PDFDocument is permanently deleted. Rationale: adding `deletedAt` to Page would collide with existing invariants (`activeCanvasId` must always point to a *live*, non-deleted Canvas; a page must always have at least one Canvas) that soft-deleting a Canvas would immediately violate — not worth the added complexity for a personal v1 tool. If accidental Page/Canvas deletion becomes a real problem in practice, revisit this decision explicitly (per AGENTS.md §7) rather than bolting on partial soft-delete support.

**Retention policy:** items stay in Trash indefinitely until manually restored or permanently deleted — **no auto-expiry in v1.** Nothing purges Trash in the background; if it needs to happen automatically later (e.g. "auto-purge after 30 days"), that's a deliberate future decision, not an implicit default.

**Trash view scope:** flat listing of every trashed Notebook/Board/PDFDocument, not nested under a (possibly also-trashed) parent — restoring a Board whose parent Notebook is still trashed leaves the Board "live" but practically unreachable in normal UI until the Notebook is restored too, same as the parent/child relationship works everywhere else in this schema. This is a deliberate simplicity tradeoff (see AGENTS.md §1), not an oversight.

## Reordering — added v4 (2026-08-11)

Boards and PDFDocuments (within a Notebook) and Canvas tabs (within a Page) support drag-to-reorder. All three use the same lightweight persistence approach: on drop, `reorderBoards`/`reorderPDFDocuments`/`reorderCanvases` reassign sequential `order` values (`1..n`) to the full list in its new order, one Dexie `update` per item inside a single transaction. No fractional-index insertion — simpler to implement correctly, and correct enough at v1's data volumes (a notebook's board/PDF count, or a page's canvas count, is never large).

`PDFDocument.order` is new in v4 — PDFs were previously listed by `createdAt` (no reordering existed). The v4 migration backfills `order` from each PDF's existing `createdAt`-sorted position, so the very first reorder starts from the same order the user already saw.

Drag-and-drop itself is native HTML5 DnD (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) — no drag-and-drop library added, per AGENTS.md §1 ("if a choice trades simplicity for flexibility nobody asked for, take simplicity"). The pure array-splice logic (`reorderList()` in `app/components/dragReorder.ts`) is shared between `NotebookContents.tsx` (Boards/PDFs) and `PDFViewer.tsx`'s `CanvasTabBar` (Canvas tabs).

## Indexing & Queries

Dexie indexes for efficient queries:

| Table | Primary Key | Indexes | Purpose |
|-------|-------------|---------|---------|
| notebooks | id | order, createdAt | List all, sort by order |
| boards | id | notebookId, order, createdAt | Get boards in notebook |
| pdfDocuments | id | notebookId, order, createdAt | Get PDFs in notebook |
| pdfFiles | pdfDocumentId | — | Raw PDF bytes, fetched once per session (v2) |
| pages | id | pdfDocumentId, pageNumber, createdAt | Get pages in PDF |
| canvases | id | pageId, order, createdAt | Get canvases for page |

`deletedAt` (notebooks/boards/pdfDocuments, v4) is deliberately **not** indexed — filtered in memory after the indexed query runs (`.filter(row => row.deletedAt == null)`), same pattern `searchAll` already used for full-table reads. Not worth a dedicated index at v1's data volume; see AGENTS.md §1.

## Storage Layer

All data access is through functions in `src/storage/db.ts`. Components never access tables directly.

**Example flow:**
```typescript
// Component code
const notebooks = await getNotebooksList();  // Pure function call

// db.ts implementation
export async function getNotebooksList(): Promise<Notebook[]> {
  return db.notebooks.orderBy("order").toArray();
}
```

**Benefits:**
- Easy to swap Dexie for a backend sync layer later
- Type-safe (TypeScript interfaces)
- Consistent error handling
- Single source of truth for query logic

## Migrations & Schema Evolution (Future)

As the project evolves, schema changes must:

1. Add new Dexie version in `db.ts` constructor
2. Write migration function to transform old data to new schema
3. Update `src/storage/types.ts` interfaces
4. Update this doc (data-model.md) in the same commit
5. Note breaking changes in commit message

Example (hypothetical):
```typescript
this.version(2).stores({ /* new schema */ }).upgrade(async (tx) => {
  // Transform v1 to v2 data
});
```

## Future Extensibility

Fields reserved for future use (do not remove):
- `Page.metadata` (future: OCR results, page labels, etc.)
- `Canvas.config` (future: per-canvas preferences)

Do not add fields speculatively. Update schema only when a feature actually needs them.
