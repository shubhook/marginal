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
  createdAt: number;         // Unix timestamp (ms)
  updatedAt: number;         // Last modification time
}
```

**Invariants:**
- Every notebook has a unique ID
- Name can be empty string (though UI should prevent this)
- Order is user-controlled (sidebar drag-to-reorder, future feature)

**Lifecycle:**
- Create: `createNotebook(name)` → returns Notebook
- Read: `getNotebook(id)` or `getNotebooksList()` → all notebooks ordered by order field
- Update: `updateNotebook(id, updates)` → patch fields, auto-updates `updatedAt`
- Delete: `deleteNotebook(id)` → cascades to all Boards and PDFDocuments

### Board

Infinite canvas attached to a notebook. No PDF.

```typescript
interface Board {
  id: string;                // Unique identifier
  notebookId: string;        // Parent notebook
  name: string;              // Display name (editable)
  order: number;             // Sort order within notebook
  createdAt: number;
  updatedAt: number;
}
```

**Invariants:**
- Every board belongs to exactly one notebook
- Order field allows future reordering within notebook

**Lifecycle:**
- Create: `createBoard(notebookId, name)` → new board, next order value
- Read: `getBoard(id)` or `getBoardsByNotebook(notebookId)` → ordered by order
- Update: `updateBoard(id, updates)` → rename, change order
- Delete: `deleteBoard(id)` → removes the board row **and** its tldraw store (`board-${id}`), so strokes don't orphan

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
  createdAt: number;
  updatedAt: number;
}
```

**Invariants:**
- Every PDF belongs to exactly one notebook
- fileName preserved for export/reference (not currently used)

**Lifecycle:**
- Create: `createPDFDocument(notebookId, name, fileName)` → new PDF, initially no pages
- Read: `getPDFDocument(id)` or `getPDFsByNotebook(notebookId)`
- Update: `updatePDFDocument(id, updates)` → rename
- Delete: `deletePDFDocument(id)` → cascades to all Pages and Canvases

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
- Delete: `deletePage(id)` → cascades to all Canvases

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

**Lifecycle:** unchanged — `createCanvas`, `createCanvasAndActivate`, `getCanvas`/`getCanvasesByPage`, `updateCanvas`, `setActiveCanvas`, `deleteCanvas`. `setActiveCanvas` now additionally reads the target canvas's `lastCameraPosition` and, if non-null, applies it via `editor.setCamera()`; if null (first visit), leave the camera wherever it currently is.

**Content storage:**
- There is exactly one tldraw store per Page (`page-${pageId}`). Every shape drawn — former "direct markup," former "spillover" — lives in this single store as an ordinary tldraw shape.
- Every shape is tagged `meta.canvasId` at creation time, set to whichever canvas is active when the shape is drawn.
- Visibility is enforced by canvasId: on every `activeCanvasId` change, shapes tagged with the new active canvas's id become visible, all others are hidden. Same mechanism `spillover.ts` already implements, now applied to all markup instead of a subset.
- The PDF page background image (`pdfbg-${pageId}`) is tagged `meta.canvasId: null` (reserved sentinel) and is always visible regardless of active canvas.

**What replaces "spillover":** the term described markup that lived on the PDF page but belonged to a specific linked canvas, distinguished from "direct markup" belonging to no canvas. That distinction collapses under this model — everything drawn belongs to whichever canvas is active at draw-time. There is no separate "direct markup" category.

## Cross-Layer Strokes (removed 2026-08-07)

A prior architecture (two separate tldraw instances — PDF panel and linked-canvas panel) required splitting a drawn stroke into two linked segments at the panel boundary. This is no longer applicable: with a single shared canvas per page (see [Canvas](#canvas)), there is no panel boundary and no coordinate-space mismatch to reconcile. A stroke drawn across what used to be the panel divider is now just one ordinary shape, tagged with whichever canvas is active — same as any other markup.

## Indexing & Queries

Dexie indexes for efficient queries:

| Table | Primary Key | Indexes | Purpose |
|-------|-------------|---------|---------|
| notebooks | id | order, createdAt | List all, sort by order |
| boards | id | notebookId, order, createdAt | Get boards in notebook |
| pdfDocuments | id | notebookId, createdAt | Get PDFs in notebook |
| pdfFiles | pdfDocumentId | — | Raw PDF bytes, fetched once per session (v2) |
| pages | id | pdfDocumentId, pageNumber, createdAt | Get pages in PDF |
| canvases | id | pageId, order, createdAt | Get canvases for page |

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
