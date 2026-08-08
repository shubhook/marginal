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

### 4. Surface 3: Linked Side-Canvases ✅ (Complete — 2026-08-04)

**Purpose:** Per-page canvas tabs for expanded notes outside the PDF margin.

**Deliverables:**
- Right panel (slides in/out via corner button, contains canvas tabs) ✅
- Tab UI (canvas name/number, active state marked with accent underline) ✅
- "+" tab to create new canvas per page ✅
- Canvas CRUD (delete, rename) ✅
- Each canvas is an independent tldraw instance with own coordinate space ✅
- Active canvas state persists per page (stored in Page.activeCanvasId) ✅
- Switching tabs swaps visible spillover strokes on PDF page ✅
- No loading delay (local operation, instant tab switch) ✅

**Explicitly not built this milestone (per scope):** real cross-layer drawing (a stroke dragged continuously from the PDF page into the panel). Spillover *rendering* (showing/hiding the active canvas's PDF-side marks) is built and verified; spillover *creation* via an actual cross-boundary drag is the next milestone. A temporary test affordance (`app/components/spillover.ts` → `addTestSpillover`, exposed as the "⊕ spill" button in the right panel) creates tagged marker shapes so the rendering rule could be verified without it.

**Design decision (see [Architecture § Linked Canvases & Spillover](./architecture.md#linked-canvases--spillover-surface-3) for full rationale):** spillover shapes live inside the page's own tldraw store, tagged with `meta.canvasId`, rather than in separate per-canvas page-stores. This keeps tab switching instant (no remount of the page/background), keeps direct markup and the background singular (no duplication across per-canvas copies), and composes directly with cross-layer drawing next — a split stroke's PDF-side segment is just another tagged shape in the same store.

**Data model changes:**
- None to the schema (`Canvas` and `Page.activeCanvasId` already existed) — added data-layer functions: `createCanvasAndActivate`, `setActiveCanvas` (keeps `Canvas.isActive` in sync with `Page.activeCanvasId`), and a `deleteCanvas` rewrite that refuses to delete a page's last canvas and reassigns the active canvas when needed. See [Data Model § Canvas](./data-model.md#canvas).
- `deleteNotebook`/`deletePDFDocument`/`deletePage` extended to also collect and delete `canvas-${id}` tldraw stores (previously only `board-${id}`/`page-${id}` were cleaned up, since no UI created canvas stores before this milestone).

**Acceptance Criteria:**
- ✓ Create a PDF page, it auto-has Canvas 0
- ✓ Click corner button, right panel opens with "Canvas 0" tab
- ✓ Click "+", new canvas created, auto-focused, named "Canvas 1/2/3"
- ✓ Draw in Canvas 0, see spillover on page
- ✓ Switch to Canvas 1, see Canvas 1's spillover on page instead
- ✓ Reload page, correct canvas is still active
- ✓ Draw in a canvas, reload page, strokes persist
- ✓ Surfaces 1 and 2 still work (spot check)

**Verification (2026-08-04):** via browser automation — created 3 linked canvases on one PDF page, drew a distinct stroke and panned each independently, confirmed full isolation (switching tabs showed each canvas's own content and camera position, untouched by the others). Added a distinguishable test-spillover mark per canvas at the same page anchor point and confirmed switching tabs showed exactly one at a time, never more than one simultaneously. Reloaded the page and confirmed all 3 canvases, the active tab, and the currently-visible spillover mark all persisted correctly. Deleted the PDFDocument and confirmed via direct IndexedDB inspection that all canvases and their tldraw stores (`canvas-*`) were removed alongside the pages, with zero orphans. Regression-checked Surface 1 (board create, draw, reload) — still works.

**Known issue found and fixed along the way:** the corner button was initially invisible — tldraw's own style panel renders at `z-index: 300`, silently covering an overlay button with a lower z-index. Fixed by giving the button `z-[400]`.

**Fix Pass I (2026-08-04):** resizable split (draggable divider, min-widths, `localStorage`-persisted), bounded panel containers (border + inset around both panels instead of full-bleed), and a first attempt at "one toolbar at a time" via per-instance `hideUi` toggling based on which panel was last interacted with.

**Fix Pass II (2026-08-05):** the `hideUi`-toggling approach from Fix Pass I was superseded by a shared floating toolbar (the "Capsule") that belongs to neither tldraw instance and routes actions to whichever panel the pointer is over. **This pulled a custom toolbar forward from Polish** (see [Architecture](./architecture.md#surface-3-fix-pass-ii--shared-capsule-camera-lock-header-alignment-2026-08-05) for why: tldraw's default UI has no concept of a toolbar shared across two editor instances, so the two-toolbar problem is architectural, not visual — hiding/showing stock chrome can only ever show one editor's *own* UI). This same pass also fixed a header-alignment bug (PDF page nav and canvas tabs now share one row) and locked the PDF panel's camera (`isLocked` + `fit-min` constraints) so it behaves as a fixed viewer panel rather than a second pannable canvas — necessary groundwork for cross-layer drawing, which needs a stable coordinate frame to anchor a cross-boundary stroke to.

**Fix Pass III (2026-08-05):** the hand-built Capsule from Fix Pass II was itself replaced — it worked but silently dropped real tldraw functionality (no style panel, no hand tool, arrow, sticky note, image upload, more-tools overflow). Swapped in tldraw's actual `DefaultToolbar`/`DefaultStylePanel` components instead, shared across both panels via the same `activeEditorRef` mechanism (unchanged) — see [Architecture](./architecture.md#surface-3-fix-pass-iii--tldraws-own-ui-collapsible-sidebar-2026-08-05) for the three tldraw internals (editor context, container context, portal theming) this took to get working standalone. Also added a collapsible sidebar (icon rail + notebook-switcher popover, `localStorage`-persisted) for laptop/tablet horizontal-space reasons, and re-verified (not changed — it was already correct) that the PDF page nav centers within its own panel rather than the full window.

### 5. Cross-Layer Drawing ✅ (Complete — 2026-08-05)

**Purpose:** Draw continuously across PDF page ↔ linked canvas boundary.

**Depends on:**
- The spillover-per-canvas rendering mechanism built in Surface 3 (tagged shapes in the page's tldraw store, visibility keyed to `activeCanvasId`) — this milestone is about *creating* those tagged shapes by splitting a real cross-boundary stroke, not inventing a new storage mechanism.
- The `activePanel`/`activeEditorRef` tracking and the PDF panel's camera lock from the Fix Pass II above — knowing which panel a drag started in, and having a stable (non-pannable) coordinate frame for the PDF side, are both prerequisites for routing and anchoring a cross-boundary stroke correctly.

**Deliverables:**
- Transparent screen-space overlay capturing drags across panel boundary ✅ (`app/components/CrossLayerCapture.tsx` — only mounts when the active tool is `draw`; a narrow strip straddling the divider, positioned from the same layout values the divider itself uses, not a separate DOM measurement)
- Mid-drag stroke rendering (stroke spans both surfaces in real time while drawing) ✅ (a `position: fixed` SVG polyline over both panels, rendered from buffered screen points — no seam at the boundary regardless of either panel's zoom/pan, since it doesn't go through either editor's camera until release)
- Stroke splitting at panel boundary after completion ✅ (`splitPointsAtDivider()` in `app/components/crossLayerDrawing.ts`)
- Storage: two linked segments per cross-boundary stroke (shared strokeGroupId) — PDF-side segment as a `meta.canvasId`-tagged shape in the page's store (same mechanism as the Surface 3 test affordance), canvas-side segment in that canvas's own store ✅
- Spillover rendering rule already enforced by Surface 3 (only active canvas spillover visible) — this milestone only needed to create correctly-tagged shapes, not rebuild visibility ✅ (verified: switching active canvas tab hides/reshows the PDF-side segment correctly, no new spillover code needed)
- ~~Known limitation: if either panel is panned/zoomed after a cross-boundary stroke, halves can separate~~ — **revised 2026-08-05, see Fix Pass below.** Originally accepted because only the PDF panel was camera-locked; once the linked-canvas panel was locked too, this limitation no longer applies and the note is removed rather than carried forward stale.

**Data model changes:**
- None (strokeGroupId already in schema; cross-layer strokes are two linked segments)

**Coordinate approach:** point conversion deliberately does **not** extend `src/canvas/coordinates.ts` — it uses each editor's own `editor.screenToPage()` directly (tldraw's camera *is* the Transform once a surface is a real tldraw instance, same precedent as the PDF page and spillover). See [Coordinates § Cross-Layer Drawing](./coordinates.md#cross-layer-drawing-resolving-the-forward-looking-note-above-2026-08-05) and [Architecture § Cross-Layer Drawing](./architecture.md#cross-layer-drawing-2026-08-05) for the full reasoning.

**Acceptance Criteria:**
- ✓ Draw a stroke starting on PDF page, drag into canvas panel, release → one continuous visible stroke
- ✓ Reload page, both halves of stroke persist correctly (verified via direct IndexedDB inspection — matching `strokeGroupId` on both segments, still aligned since neither camera moved)
- ✓ Active canvas switch, correct spillover visible — verified: PDF-side segment hides when its tagged canvas isn't active, reshows when switched back
- ✓ A same-panel drag that never crosses the boundary still draws normally with no regression
- ✓ All previous surfaces still work (shared floating toolbar, camera lock, resizable split, direct markup all spot-checked)

**Verification note:** tldraw's IndexedDB persistence is debounced — reading the database within ~1 second of a drag can show stale/empty results even though the shapes exist correctly in the editor's in-memory store. Wait 1–2 seconds before trusting an empty read as a real failure (this produced several false negatives during this milestone's verification before being traced to timing, not a code bug).

#### Fix Pass — Stuck Drag State (2026-08-05)

Real (non-automated) use surfaced a drag-tracking bug that automated testing hadn't caught: `setPointerCapture` on the narrow capture strip could silently fail to keep delivering events once a drag left the strip, leaving the drag permanently "stuck" — visible as an unerasable scribble, and (since the drag never completed) preventing genuine crossings from ever getting tagged/split. Fixed by tracking drags with `window`-level pointer listeners instead of relying on the strip element. Full writeup: [Architecture § Fix Pass — Stuck Drag State & Untagged Segments](./architecture.md#fix-pass--stuck-drag-state--untagged-segments-2026-08-05).

#### Fix Pass — Camera Lock Extended to the Linked-Canvas Panel (2026-08-05)

The linked-canvas panel is now camera-locked the same way the PDF panel already was — `isLocked: true` in `RightPanel.tsx`'s `onMount`, no user-driven pan/wheel/pinch/keyboard zoom. Unlike the PDF panel, no `constraints` block is set (there's no fixed "page size" for an unbounded canvas to fit against); the camera is simply forced to `(0, 0, 1)` at mount and never allowed to move again. tldraw's own resize handling (verified via its source — `getConstrainedCamera` passes camera x/y/z through unchanged when `constraints` is absent) keeps this correct on window/divider resize for free, no manual refit code needed.

With both panels' cameras permanently fixed, the previous milestone's accepted pan/zoom-separation limitation no longer applies — removed from the acceptance criteria above, not carried forward. See [Architecture § Camera Lock Extended](./architecture.md#fix-pass--camera-lock-extended-to-the-linked-canvas-panel-2026-08-05) for the full rationale, including why `constraints` was deliberately left out.

**Spillover-swap bug reported alongside this:** investigated at length (both via the `addTestSpillover` test affordance and via real cross-layer strokes, single- and multi-canvas, forward and backward switching, and the canvas-creation flow) — could not reproduce on the current codebase. `applySpilloverVisibility`'s swap logic is correct and was exercised successfully in every scenario tried. The most likely explanation: the reported symptom was a downstream effect of the *previous* Fix Pass's stuck-drag bug (untagged strays from incomplete crossings are, correctly, always-visible — indistinguishable from "stale spillover" if that's what was on screen at the time), observed before that fix was picked up, or from stale pre-fix shapes left in the browser's own IndexedDB. No code change was needed or made for this specific report beyond the drag-tracking fix already shipped; if it recurs on fresh data after this pass, that's a new bug, not this one.

### Single Canvas Migration ✅ (Implemented — 2026-08-07)

**Architecture revision, not a bug fix.**

**What changed:** each Page went from mounting two independent tldraw instances — the PDF panel (`page-${pageId}`) and the linked-canvas panel (`canvas-${canvasId}`), split-paned side by side — to mounting exactly one. Every linked Canvas's content now lives in the same `page-${pageId}` store as direct markup and the PDF background, tagged with `meta.canvasId`; canvas tabs became a plain visibility toggle over that one store instead of a second mounted editor.

**Why:** every fix pass after Surface 3 shipped (Fix Pass I, II, III, and both Cross-Layer Drawing fix passes — see [Architecture](./architecture.md)) was, in one form or another, patching the same underlying problem: two independently-cameraed tldraw instances need to be kept in sync to feel like one coherent surface — one shared toolbar instead of two, one locked camera instead of a free one, then a second locked camera, a capture-strip overlay to fake a continuous stroke across the boundary, window-level pointer tracking because the strip couldn't reliably keep events, and the tool-desync bug this session started from (each editor tracking its own current tool, so the shared toolbar's displayed state depended on which panel the pointer last entered). Each fix pass made the two-instance model *work*, never made the underlying seam disappear. Collapsing to one tldraw instance per page removes the seam instead of patching around it: there is no panel boundary to cross, no second camera to lock or keep in sync, and no coordinate-space mismatch to reconcile.

**What this removes:**
- The split-pane layout (PDF panel | draggable divider | linked-canvas panel) in `PageShell`
- Camera locks on both panels (`RightPanel.tsx`'s `setCameraOptions`/`setCamera` calls, and the PDF panel's `constraints` block existed partly to give cross-layer drawing a stable frame to anchor to — no longer needed once there's only one camera)
- `activeEditorRef`/`activeEditorVersion`/`activePanel` — the machinery that tracked which of the two tldraw instances the pointer last entered, so the shared toolbar and cross-layer capture could target the right one
- The standalone-toolbar extraction (`FloatingTldrawUi.tsx`) — with one tldraw instance, its own stock `DefaultToolbar`/`DefaultStylePanel` can be used directly (`hideUi={false}`), no externally-mounted toolbar bound via `EditorContext`/`ContainerProvider` needed
- Cross-layer stroke splitting (`app/components/crossLayerDrawing.ts`, `app/components/CrossLayerCapture.tsx`) and the two-segment/`strokeGroupId` storage model — a stroke crossing what used to be the panel boundary is now just one shape, no split needed

See [Architecture](./architecture.md) — the Coordinate Spaces, Component Tree, Linked Canvases & Spillover, and Storage Architecture sections have been revised to describe the single-store model directly; Surface 3 Fix Pass I/II/III and the Cross-Layer Drawing milestone (plus its two fix-pass subsections) are marked superseded but kept as historical record of why the two-instance model was built the way it was.

**Schema change:** `Canvas.lastCameraPosition: {x, y, z} | null` (Dexie **version 3**) — replaces the removed per-canvas camera (each canvas used to have its own persisted tldraw camera by virtue of being its own store; the shared store needs an explicit field to remember where each canvas's "view" was). Null until a canvas has ever been active. See [Data Model § Canvas](./data-model.md#canvas).

**Data migration note:** pre-existing `canvas-${id}` tldraw stores (dev data from before this migration) are **not** migrated into the shared page store — their content is orphaned (harmless-but-invisible, cleaned up automatically if that canvas is later deleted). Acceptable for pre-MVP dev data; flagged here rather than attempting a complex transform.

**Verification (2026-08-07):** via browser automation, against real persisted dev data (not a fresh fixture) — confirmed a single tldraw instance with native stock UI (no more `hideUi`, no split, no corner button); created a second canvas tab, drew a shape on it, confirmed it hides when switching to the other tab and reappears when switching back, with no ghost selection outline left behind (a cosmetic issue found and fixed during this pass — canvas switching now calls `editor.selectNone()`); confirmed free pan/zoom (no camera lock) and that each canvas's camera position is saved on switch-away and restored on switch-back; drew a stroke starting over the PDF content and continuing well past where the old panel divider used to sit — rendered as one ordinary shape, no seam, no special handling; reloaded the page and confirmed both canvases, the active tab, the tagged shapes' visibility, and both canvases' camera positions all persisted correctly; regression-checked Boards (Surface 1) — still works, unaffected. `bunx tsc --noEmit` and `bun run build` both clean; all 12 `coordinates.test.ts` tests still pass.

### 6. Polish (Next)

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
