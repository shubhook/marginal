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
- Board creation (CRUD in sidebar, persist to IndexedDB)
- Infinite canvas using tldraw
- Pan/zoom with coordinate transforms validated in real UI
- Freehand draw (pen tool)
- Shapes (rectangle, circle, line via tldraw)
- Text tool
- Toolbar (Excalidraw-style floating pill, bottom-center)
- Tool keyboard shortcuts (v=select, p=pen, r=rectangle, t=text, e=eraser)
- Undo/redo

**Data model changes:**
- None (schema already supports this)

**Acceptance Criteria:**
- ✓ Can create a board, draw a stroke, reload page, stroke persists
- ✓ Pan/zoom work smoothly
- ✓ Coordinate transforms are still validated (draw at various zoom levels, pan mid-stroke)
- ✓ Toolbar matches STYLING.md (floating pill, icon-only, subtle hover)
- ✓ Previous milestone (notebook sidebar) still works (spot check)

### 3. Surface 2: PDF Import & Direct Markup

**Purpose:** Import PDF, render pages, mark up directly.

**Deliverables:**
- PDF file upload (file input, store in IndexedDB or as reference)
- PDF.js integration to render pages
- PDFDocument CRUD in sidebar (create/rename/delete)
- Page navigation (within a PDF)
- Direct markup layer on page (draw straight on page coordinate space)
- Markup tools scoped to page (pen, shapes, text, eraser, highlighter)
- Corner button on PDF page (top-right, small) to toggle right panel
- Auto-create Canvas 0 per page (already in data model, just surface it in UI)

**Data model changes:**
- None (schema already supports Page and Canvas)

**Acceptance Criteria:**
- ✓ Upload a PDF, see pages rendered at native aspect ratio
- ✓ Draw markup on a page, reload, markup persists
- ✓ Toolbar switches context (pen on page vs. on linked canvas)
- ✓ Page dimensions are correct and stable across pan/zoom
- ✓ Canvas 0 exists and renders spillover correctly (though no cross-layer drawing yet)
- ✓ Surfaces 1 and 2 coexist (can switch between a board and a PDF without breaking either)

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
| next-auth + Postgres backend | Multi-device access actually needed | Post-v1 |
| Cross-device sync | Depends on backend | Post-v1 |
| OCR | Tesseract.js as stopgap; API later | Post-v1 or Polish |
| Mobile/touch support | Usage pattern shifts to tablet/phone | Post-v1 |
| Collaboration | Never planned (single-user tool) | N/A |

These are defaults, not permanent laws. If real usage reveals one is needed sooner, revisit this doc and re-scope.
