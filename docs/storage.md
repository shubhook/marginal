# Storage & Persistence

How data is stored, accessed, and managed.

## Storage Architecture

**IndexedDB via Dexie** is the sole persistence layer for v1.

```
React Components (UI)
        ↓
Data-Access Layer (src/storage/db.ts)
        ↓
Dexie (Object-Relational Mapper)
        ↓
IndexedDB (Browser Storage)
```

## IndexedDB Setup

Database name: `"marginal"`

Defined in `src/storage/db.ts`:

```typescript
export class MarginalDB extends Dexie {
  notebooks!: Table<Notebook>;
  boards!: Table<Board>;
  pdfDocuments!: Table<PDFDocument>;
  pages!: Table<Page>;
  canvases!: Table<Canvas>;

  constructor() {
    super("marginal");
    this.version(1).stores({
      notebooks: "id, order, createdAt",
      boards: "id, notebookId, order, createdAt",
      pdfDocuments: "id, notebookId, createdAt",
      pages: "id, pdfDocumentId, pageNumber, createdAt",
      canvases: "id, pageId, order, createdAt",
    });
  }
}
```

## Data Access Layer

**Never access Dexie tables directly from components.** Always go through functions in `src/storage/db.ts`.

### CRUD Functions

Every entity has standard CRUD functions:

```typescript
// Create
createNotebook(name: string): Promise<Notebook>
createBoard(notebookId: string, name: string): Promise<Board>
createPDFDocument(notebookId: string, name: string, fileName: string): Promise<PDFDocument>
createPage(pdfDocumentId: string, pageNumber: number, width: number, height: number): Promise<Page>
createCanvas(pageId: string, name: string): Promise<string> // Returns canvas ID

// Read
getNotebook(id: string): Promise<Notebook | undefined>
getNotebooksList(): Promise<Notebook[]>
getBoard(id: string): Promise<Board | undefined>
getBoardsByNotebook(notebookId: string): Promise<Board[]>
// ... etc

// Update
updateNotebook(id: string, updates: Partial<Omit<Notebook, 'id'>>): Promise<void>
updateBoard(id: string, updates: Partial<Omit<Board, 'id' | 'notebookId'>>): Promise<void>
// ... etc

// Delete
deleteNotebook(id: string): Promise<void>  // Cascades to boards/PDFs
deleteBoard(id: string): Promise<void>
// ... etc
```

### Error Handling

All data-access functions are async. Components catch errors:

```typescript
try {
  const notebooks = await getNotebooksList();
  setNotebooks(notebooks);
} catch (error) {
  console.error("Failed to load notebooks:", error);
  // UI shows degraded state or error message
}
```

### Cascading Deletes

Deleting a parent cascades to children:

- Delete **Notebook** → deletes all Boards and PDFDocuments in it
- Delete **PDFDocument** → deletes all Pages and Canvases in it
- Delete **Page** → deletes all Canvases in it
- Delete **Canvas** → standalone (no children)

Implemented via `db.transaction()` to ensure atomicity:

```typescript
export async function deleteNotebook(id: string): Promise<void> {
  await db.transaction("rw", db.notebooks, db.boards, db.pdfDocuments, async () => {
    // Delete boards
    const boards = await db.boards.where("notebookId").equals(id).toArray();
    for (const board of boards) {
      await db.boards.delete(board.id);
    }
    // Delete PDFs (which cascades to pages/canvases)
    const pdfs = await db.pdfDocuments.where("notebookId").equals(id).toArray();
    for (const pdf of pdfs) {
      await deletePDFDocument(pdf.id);
    }
    // Delete notebook
    await db.notebooks.delete(id);
  });
}
```

## Async/Await Patterns

All Dexie operations are async, but **writes should feel synchronous to the user** (optimistic updates).

### Optimistic Updates Pattern

```typescript
// User clicks "Create Notebook"
const handleCreateNotebook = async () => {
  try {
    // 1. Call data-access function
    const notebook = await createNotebook(name);
    
    // 2. Update local state immediately (optimistic)
    setNotebooks([...notebooks, notebook]);
    
    // 3. User sees change instantly
  } catch (error) {
    // 4. If DB write fails, show error and revert state
    console.error("Failed to create notebook:", error);
    // Could call setNotebooks(original) to revert
  }
};
```

**Why:** IndexedDB is local (no network latency), so by the time the promise resolves, the data is already persisted. Optimistic updates feel snappier to the user.

### Batch Operations

For operations involving multiple entities, use transactions:

```typescript
export async function moveBoardToNotebook(
  boardId: string,
  fromNotebookId: string,
  toNotebookId: string
): Promise<void> {
  await db.transaction("rw", db.boards, db.notebooks, async () => {
    // Both operations succeed or both fail
    await updateBoard(boardId, { notebookId: toNotebookId });
    // Could also update parent notebook metadata if needed
  });
}
```

## Storage Limits

IndexedDB quota varies by browser, but typical:
- **Chrome:** ~10% of available disk space (usually 100MB+)
- **Firefox:** ~10% of available disk space
- **Safari:** ~50MB per site

For a single user taking notes, this is effectively unlimited (a year of notes is < 1MB).

If quota is exceeded, writes fail. Handle gracefully (show error, allow user to delete old notebooks).

## Schema Versioning (Future)

When schema changes, create a new version and migration:

```typescript
this.version(2).stores({
  // New schema
  notebooks: "id, order, createdAt, modifiedAt",  // Added modifiedAt
}).upgrade(async (tx) => {
  // Transform v1 data to v2
  const allNotebooks = await tx.notebooks.toArray();
  for (const nb of allNotebooks) {
    nb.modifiedAt = nb.updatedAt; // Backfill
    await tx.notebooks.put(nb);
  }
});
```

## Data Export & Import (Future)

### Export

```typescript
export async function exportNotebook(notebookId: string): Promise<string> {
  const notebook = await getNotebook(notebookId);
  const boards = await getBoardsByNotebook(notebookId);
  const pdfs = await getPDFsByNotebook(notebookId);
  
  // Serialize to JSON
  const data = { notebook, boards, pdfs };
  return JSON.stringify(data, null, 2);
}
```

### Import

```typescript
export async function importNotebook(jsonData: string): Promise<Notebook> {
  const data = JSON.parse(jsonData);
  
  // Validate schema
  // Create new notebook + boards
  // Return created notebook
}
```

Currently not implemented (deferred to Polish phase).

## Backup & Recovery

No automatic backups in v1. User must manually export.

**Future consideration:** Periodic auto-backup to cloud (when backend exists).

## Browser Compatibility

IndexedDB is supported in all modern browsers:
- Chrome 24+
- Firefox 16+
- Safari 10+
- Edge 12+

Dexie handles most browser quirks automatically.

## Performance Tuning (Future)

If real usage reveals slowness:

1. **Profile:** Check which queries are slow (Dexie has debug mode)
2. **Index:** Add indexes to hot query paths
3. **Denormalize:** Cache computed data if needed (e.g., notebook item count)
4. **Batch:** Use transactions for multi-entity operations

Likely unnecessary for single-user local tool, but document here for when it matters.

## Offline-First Assumptions (v1 Only)

v1 assumes:
- No network sync
- No concurrent edits
- No cloud backup

When backend is added (post-v1):
- IndexedDB becomes local cache
- Conflicts resolved server-side
- Data-access layer handles sync
- This doc updates accordingly

## Debugging

Enable Dexie debug mode:

```typescript
import { enableDebug } from "dexie";
enableDebug("warn"); // Or "error", "log"
```

Logs all queries and operations to console.

## Testing Storage

Basic CRUD test approach:

```typescript
// 1. Create
const notebook = await createNotebook("Test Notebook");
assert(notebook.id); // Has ID

// 2. Read
const fetched = await getNotebook(notebook.id);
assert(fetched?.name === "Test Notebook");

// 3. Update
await updateNotebook(notebook.id, { name: "Updated" });
const updated = await getNotebook(notebook.id);
assert(updated?.name === "Updated");

// 4. Delete
await deleteNotebook(notebook.id);
const deleted = await getNotebook(notebook.id);
assert(deleted === undefined);
```

No formal test suite yet; rely on manual verification in dev workflow.
