# PRD — Marginal

> **Status:** Living document. This is not a spec frozen at build start — update it as decisions change. Every section below is a default, not a law. If reality diverges from this doc during implementation, the doc is wrong and should be fixed, not the code forced to match it.

**Version:** 0.1
**Last updated:** 2026-08-04
**Owner:** Khakha

---

## 1. What this is

Marginal is a personal, local-first notebook tool. It combines three things that are normally separate apps:

1. An infinite freeform canvas (Excalidraw-like) for freehand notes.
2. A PDF viewer with direct markup on the page.
3. Linked side-canvases attached to a PDF page, for expanded notes that don't fit in the margin.

It is built for one user (Khakha), for daily personal use — coursework notes, project sketches, PDF markup on readings/papers. It is not a SaaS product, not built for other users, and not optimizing for onboarding, multi-tenancy, or growth. Every scoping decision defaults toward "what makes this pleasant for one person to use every day," not "what makes this generalizable."

## 2. Problem being solved

Existing tools force a tradeoff:
- Excalidraw: great canvas, no PDF support.
- Notability/GoodNotes: good PDF + canvas hybrid, but not self-hosted/local-first, not extensible, platform-locked.
- Obsidian/Notion: good structured notes, poor freeform drawing, no native PDF markup.

Marginal exists to combine canvas + PDF markup + notebook structure without vendor lock-in, running entirely local (no server dependency for the core loop).

## 3. Non-goals (explicit — revisit if priorities change)

- Multi-user collaboration — not planned. Would require an entirely different sync architecture; not worth designing around speculatively.
- Mobile-first design — desktop trackpad/mouse is the target input method for v1.
- General-purpose PDF editor (merging, splitting, form-filling) — out of scope. This is a notes tool, not a PDF utility.
- Cross-device sync — deferred until backend exists (see §7).

These are defaults, not permanent walls. If Khakha's actual usage reveals one of these is needed sooner, update this section and re-scope — don't silently build it unplanned.

## 4. Core entities

```
Notebook
  └── Board            (canvas-only surface)
  └── PDFDocument
        └── Page        (fixed dimensions, matches source PDF page)
              ├── activeCanvasId
              └── Canvas[]   (linked side-canvases, tagged shapes in the Page's shared store)
```

- A **Notebook** is a flat container of Boards and PDFDocuments. No nested notebooks (flat hierarchy — decided to avoid folder-in-folder feature creep; revisit only if flat genuinely becomes unusable in practice).
- A **Board** is a standalone infinite canvas, not attached to any PDF.
- A **PDFDocument** holds Pages. Each Page can have direct markup and/or multiple linked Canvases.
- Only one Canvas per Page is "active" at a time. All markup for a Page lives in a single shared tldraw store, with every shape tagged by which Canvas was active when it was drawn — switching the active canvas shows only that canvas's tagged shapes on the page. (Earlier versions of this app gave each linked Canvas its own coordinate space and split cross-boundary strokes into linked segments; that approach was dropped — see Changelog.)

This model is expected to evolve. Treat it as the current best understanding, not a locked schema — see AGENTS.md for how to handle schema changes safely.

## 5. Feature list — build order

### Foundation (infrastructure, no user-facing feature)
- Next.js scaffold, client-only editor tree
- tldraw integration as base editor primitive
- IndexedDB (Dexie) schema, notebook-aware from the start
- Coordinate transform system (PDF-page space ↔ canvas space ↔ screen space)
- Notebook CRUD + sidebar navigation

### Surface 1 — Canvas-only mode
- Infinite canvas: pan/zoom, freehand draw, shapes, text
- Persisted boards inside a notebook

### Surface 2 — PDF import + direct annotation
- PDF.js import, page rendered as fixed-dimension background
- Direct markup layer on the PDF page

### Surface 3 — Linked side-canvases
- Corner button on PDF page → right panel → per-page canvas tabs
- Every linked canvas shares one tldraw store per Page, shapes tagged by `meta.canvasId` — not a separate coordinate space per canvas (see § Architecture note below)
- Auto-create canvas 0 per page (no null active-canvas state)
- Active-canvas visibility rule: switching tabs shows only the active canvas's tagged shapes on the page

### Polish
- Export (PNG/PDF)
- Keyboard shortcuts (Excalidraw scheme: v=select, p=pen, r=rectangle, t=text)
- Search across notebooks/boards/pages

## 6. Success criteria

Not "launch metrics" — this is a personal tool. Success = Khakha actually uses it daily instead of falling back to physical notebooks or existing apps, specifically for:
- Taking freeform notes without friction (canvas feels as fast as Excalidraw)
- Marking up a PDF reading without exporting to another app
- Not losing track of notes across a semester (notebook structure holds up over real volume, not just a demo)

If any of these three fail in practice, that's a signal to revisit this PRD, not a signal to push through.

## 7. Future scope (explicitly deferred, not forgotten)

| Feature | Trigger for building it |
|---|---|
| Trash/Recently Deleted | After accidental deletions become a real problem; restore deleted notebooks from trash |
| next-auth + Postgres backend | When cross-device access is actually needed |
| Multi-device sync | Depends on backend; IndexedDB becomes local cache, Postgres source of truth |
| OCR | Tesseract.js client-side as stopgap; real OCR API once backend exists |
| Mobile/touch support | Only if daily usage pattern shifts to a tablet/phone |

## 8. Open questions (resolve before or during relevant build phase)

- None currently blocking. Add here as they arise — don't let unresolved questions sit silently in someone's head, write them down.

## Changelog

- 2026-08-20 — Cross-layer drawing (continuous PDF↔canvas strokes, linked-segment storage) dropped from the build order and removed from §4/§5. Superseded by the single-shared-store-per-Page model (one tldraw store per Page, shapes tagged by `meta.canvasId`), which eliminates the panel boundary the feature existed to draw across. See `docs/data-model.md` § Cross-Layer Strokes (removed) and `docs/architecture.md` for the historical record of why.
- 2026-08-04 — Initial PRD drafted from planning conversation. Flat notebook hierarchy decided. Non-goals section added explicitly to prevent scope creep.
