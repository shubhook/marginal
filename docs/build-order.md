# Build Order & Roadmap

Development milestones in strict order. **Do not skip ahead.**

## Why Strict Order?

The coordinate-transform system underpins every later surface. If the math is wrong, every feature built on top inherits the bug in ways that are hard to trace back. Each surface must reach a genuinely working, manually-verified state before the next begins.

## Milestones

### 1. Foundation ✅ (Complete)

**Purpose:** Infrastructure every later surface depends on.

**Deliverables:**
- ✅ Next.js scaffold (App Router, TypeScript, Tailwind)
- ✅ tldraw integration (renders, pan/zoom works out of box)
- ✅ IndexedDB schema (Dexie with Notebook, Board, PDFDocument, Page, Canvas)
- ✅ Data-access layer (CRUD functions behind small interface)
- ✅ Coordinate transform system (pure functions, 12 passing tests)
- ✅ Notebook CRUD + sidebar (create/rename/delete with persistence)

**Acceptance Criteria:**
- Dev server runs without errors
- Notebook CRUD persists across page reloads
- tldraw renders when a notebook is selected
- Coordinate transform unit tests all pass
- No hydration warnings or broken UI

### 2. Surface 1: Canvas-Only Mode (Next)

**Purpose:** Infinite canvas with drawing, shapes, and text. No PDF yet.

**Deliverables:**
- Board creation (CRUD in sidebar, persist to IndexedDB) ✅
- Infinite canvas using tldraw ✅
- Pan/zoom with coordinate transforms validated in real UI
- Freehand draw (pen tool) ✅ (via tldraw default toolbar)
- Shapes (rectangle, circle, line via tldraw) ✅ (via tldraw default toolbar)
- Text tool ✅ (via tldraw default toolbar)
- Tool keyboard shortcuts (v=select, p=pen, r=rectangle, t=text, e=eraser) — provided by tldraw defaults; custom bindings not layered on top yet
- Undo/redo ✅ (via tldraw default toolbar)

**Explicitly deferred to Polish (not a Surface 1 blocker):**
- Custom floating-pill toolbar styling (STYLING.md §5 / UI.md §3). tldraw's stock toolbar is used as-is for now — it already provides select/pen/shapes/text/eraser/undo/redo. Restyling it to match the dark, icon-only, bottom-center pill is a visual-polish task, not an architecture task, and doesn't block calling Surface 1 "done."

**Data model changes:**
- None (schema already supports this) — see [Board entity wiring](./data-model.md#board) for the fix that connected the existing `Board` schema to the UI.

**Acceptance Criteria:**
- ✓ Notebook shows a list of Boards (not an immediately-mounted canvas) — empty state offers "create a board"
- ✓ Can create a board, draw a stroke, reload page, stroke persists
- ✓ Two boards in the same notebook have independent, isolated canvas state (verified via browser automation — see below)
- ✓ Pan/zoom work smoothly
- ✓ Coordinate transforms are still validated (draw at various zoom levels, pan mid-stroke)
- ✓ Deleting a notebook cascades to delete its boards (verified at the IndexedDB level, not just UI)
- ~~Toolbar matches STYLING.md~~ — deferred to Polish, see above
- ✓ Previous milestone (notebook sidebar) still works (spot check)

**Verification (2026-08-04):** Manually tested via browser automation — created a notebook, created two boards inside it, drew a distinct stroke on each, confirmed each board round-trips through a full page reload with its own state intact and no cross-contamination. Deleted the notebook and confirmed via direct IndexedDB inspection that both boards were removed (0 notebooks, 0 boards, no orphans).

### 3. Surface 2: PDF Import & Direct Markup ✅ (Complete — 2026-08-04)

**Purpose:** Import PDF, render pages, mark up directly.

**Deliverables:**
- PDF file upload (file picker, raw bytes stored in the `pdfFiles` Dexie table) ✅
- PDF.js integration to render pages (lazy-loaded, cached — see [Architecture](./architecture.md#pdf-rendering--direct-markup-surface-2)) ✅
- PDFDocument CRUD alongside Boards in `NotebookContents` (import/rename/delete) ✅
- Page navigation: **single-page view with prev/next** (chosen over vertical scroll — one tldraw instance mounted at a time, mirrors the board pattern) ✅
- Direct markup layer on page (per-page tldraw store `page-${pageId}`, PDF-page coordinates by construction) ✅
- Markup tools scoped to page — tldraw default toolbar (pen, shapes, text, eraser; custom pill + highlighter deferred to Polish, same decision as Surface 1) ✅
- Auto-create Canvas 0 per page — done at the data layer since Foundation; **surfacing it in UI (corner button, right panel) is Surface 3**, not this milestone
- Cascading delete: PDF → pages → canvases → stored bytes → per-page markup stores ✅

**Data model changes:**
- Dexie **version 2**: added `pdfFiles` table (raw bytes keyed by `pdfDocumentId`) — see [Data Model](./data-model.md#pdffile)
- `deleteBoard`/`deletePage`/`deletePDFDocument`/`deleteNotebook` now also delete the corresponding tldraw markup stores (no orphaned strokes)

**Acceptance Criteria:**
- ✓ Upload a PDF, see pages rendered at native aspect ratio
- ✓ Page dimensions come from each source page, not assumed (verified with a 3-page PDF where every page has different dimensions: 612×792, 595×842, 400×300)
- ✓ Draw markup on a page, navigate away and back, reload — markup persists, position-accurate relative to page content
- ✓ Page dimensions are correct and stable across pan/zoom (page bitmap and markup live in the same tldraw space, so they cannot desync)
- ✓ Deleting the PDF cascades: 0 pages, 0 canvases, 0 stored bytes, 0 markup stores (verified via direct IndexedDB inspection)
- ✓ Surfaces 1 and 2 coexist (board created and drawn on after PDF work, no breakage)

**Verification (2026-08-04):** via browser automation — imported the mixed-size 3-page PDF, confirmed per-page dimensions/aspect (zoom-to-fit at 84%/79%/222% respectively), drew an underline beneath page 1's title, navigated 1→2→3→1 and reloaded with the stroke staying exactly under the title, then deleted the PDF and confirmed the full cascade at the IndexedDB level.

**Next:** Surface 3 (linked side-canvases) — the corner button, right panel, canvas tabs, and spillover. Cross-layer drawing then has both of its prerequisites in place.

### 4. Surface 3: Linked Side-Canvases

**Purpose:** Per-page canvas tabs for expanded notes outside the PDF margin.

**Deliverables:**
- Right panel (slides in/out via corner button, contains canvas tabs)
- Tab UI (canvas name/number, active state marked with accent underline)
- "+" tab to create new canvas per page
- Canvas CRUD (delete, rename)
- Each canvas is an independent tldraw instance with own coordinate space
- Active canvas state persists per page (stored in Page.activeCanvasId)
- Switching tabs swaps visible spillover strokes on PDF page
- No loading delay (local operation, instant tab switch)

**Data model changes:**
- None (Canvas entity and activeCanvasId already in schema)

**Acceptance Criteria:**
- ✓ Create a PDF page, it auto-has Canvas 0
- ✓ Click corner button, right panel opens with "Canvas 0" tab
- ✓ Click "+", new canvas created, auto-focused, named "Canvas 1/2/3"
- ✓ Draw in Canvas 0, see spillover on page
- ✓ Switch to Canvas 1, see Canvas 1's spillover on page instead
- ✓ Reload page, correct canvas is still active
- ✓ Draw in a canvas, reload page, strokes persist
- ✓ Surfaces 1 and 2 still work (spot check)

### 5. Cross-Layer Drawing

**Purpose:** Draw continuously across PDF page ↔ linked canvas boundary.

**Deliverables:**
- Transparent screen-space overlay capturing drags across panel boundary
- Mid-drag stroke rendering (stroke spans both surfaces in real time while drawing)
- Stroke splitting at panel boundary after completion
- Storage: two linked segments per cross-boundary stroke (shared strokeGroupId)
- Spillover rendering rule enforced (only active canvas spillover visible)
- Known limitation: if either panel is panned/zoomed after a cross-boundary stroke, halves can separate (documented, not a bug to fix silently)

**Data model changes:**
- None (strokeGroupId already in schema; cross-layer strokes are two linked segments)

**Acceptance Criteria:**
- ✓ Draw a stroke starting on PDF page, drag into canvas panel, release → one continuous visible stroke
- ✓ Reload page, both halves of stroke persist correctly
- ✓ Pan one panel, stroke halves visually separate (expected and documented)
- ✓ Active canvas switch, correct spillover visible
- ✓ All previous surfaces still work

### 6. Polish (Future)

**Deliverables:**
- Export (PNG/PDF)
- Enhanced keyboard shortcuts (quick notebook switcher, page nav, etc.)
- Search across notebooks/boards/pages
- Performance optimization
- Edge case handling

**Acceptance Criteria:**
- TBD per Polish phase

## Branching & Commits

- **One milestone per branch** (or one major feature within a milestone)
- **Commit early, commit often** within a milestone
- **Format:** `<type>: <short description>` (e.g., `feat: add PDF import`, `fix: coordinate rounding error`)
- **Include context:** If a commit is addressing a known limitation or future decision, note it in the PR/commit

## Testing Strategy

- **Unit tests** for isolated concerns (coordinate transforms, math functions)
- **Manual verification** for UI/UX (the app must feel good to use daily)
- **Regression spot-checks** at end of each milestone (verify previous surfaces still work)

No strict test coverage target; focus on catching bugs in infrastructure (coordinates, data layer) via tests, and on catching UX bugs via manual use.

## Future Scope (Explicitly Deferred)

| Feature | Trigger | Phase |
|---------|---------|-------|
| Trash/Recently Deleted | Accidental deletions become a real problem | Polish or Post-v1 |
| next-auth + Postgres backend | Multi-device access actually needed | Post-v1 |
| Cross-device sync | Depends on backend | Post-v1 |
| OCR | Tesseract.js as stopgap; API later | Post-v1 or Polish |
| Mobile/touch support | Usage pattern shifts to tablet/phone | Post-v1 |
| Collaboration | Never planned (single-user tool) | N/A |

These are defaults, not permanent laws. If real usage reveals one is needed sooner, revisit this doc and re-scope.
