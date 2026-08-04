# Marginal

A personal, local-first notebook tool combining an infinite freeform canvas, PDF markup, and linked side-canvases attached to PDF pages. Built for daily personal use — coursework notes, project sketches, and annotating readings — without vendor lock-in or a required backend.

## What it does

- **Canvas mode** — Excalidraw-style infinite canvas for freehand notes, shapes, and text.
- **PDF markup** — import a PDF, draw directly on the page.
- **Linked canvases** — open expanded, independent note-canvases attached to any PDF page, without cluttering the page itself.
- **Cross-layer drawing** — draw a single continuous stroke starting on the PDF page and flowing onto a linked canvas.
- **Notebooks** — group related boards and PDFs together instead of one flat list of everything.

Everything runs client-side. No account, no server required for v1. See `PRD.md` §3 for explicit non-goals (multi-user, mobile-first, general PDF editing — not planned).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Canvas editor | tldraw |
| PDF rendering | PDF.js |
| Storage | IndexedDB via Dexie (local-first, no server) |
| State | Zustand |
| Styling | Tailwind + shadcn/ui |
| Auth / backend | next-auth + Postgres — deferred, see `PRD.md` §7 |

Rationale for each choice is in `PRD.md` and the planning history — not repeated here to avoid drift between docs.

## Project docs

Read these in order before contributing (human or agent):

1. **`PRD.md`** — what this is, why, non-goals, feature build order, success criteria.
2. **`AGENTS.md`** — how any coding agent (Claude Code included) should work in this repo: build order, data model rules, coordinate system rules, what "done" means.
3. **`UI.md`** — layout and interaction behavior.
4. **`STYLING.md`** — visual system: color, typography, spacing.

All four are living documents. If something in the code diverges from a doc, the doc is expected to be updated in the same pass — see `AGENTS.md` §3 and §6.

## Status

Early build. Currently in the **Foundation milestone** (see `PRD.md` §5): project scaffold, tldraw integration, IndexedDB schema, coordinate transform system, and notebook navigation — no user-facing canvas/PDF features yet.

## Getting started

```bash
bun install
bun run dev
```

Requires Node (LTS). No environment variables or backend setup needed for local development in the current milestone.

## Build order

Foundation → Canvas-only boards → PDF import + direct markup → Linked side-canvases → Cross-layer drawing → Polish (export, shortcuts, search). Full detail in `PRD.md` §5. Do not skip ahead — see `AGENTS.md` §2 for why the order matters.

## License

Personal project, not currently licensed for reuse.