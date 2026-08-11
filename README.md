# **Marginal**

A personal, local-first notebook tool combining an infinite freeform canvas, PDF markup, and linked side-canvases attached to PDF pages.

**Marginal** runs entirely client-side, with no account and no required backend. It's built for one person's daily use — coursework notes, project sketches, and annotating readings — not for general-purpose PDF editing or multi-user collaboration. See `PRD.md` §3 for the explicit non-goals.

[What it does](#what-it-does) · [Tech Stack](#tech-stack) · [Project Docs](#project-docs) · [Getting Started](#getting-started) · [Build Order](#build-order) · [Development](#development) · [Status](#status) · [License](#license)

---

## What it does

- **Canvas mode** — Excalidraw-style infinite canvas for freehand notes, shapes, and text.
- **PDF markup** — import a PDF, draw directly on the page.
- **Linked canvases** — open expanded, independent note-canvases attached to any PDF page, without cluttering the page itself.
- **Cross-layer drawing** — draw a single continuous stroke starting on the PDF page and flowing onto a linked canvas.
- **Notebooks** — group related boards and PDFs together instead of one flat list of everything.

---

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

---

## Project docs

Read these in order before contributing (human or agent):

| File | Covers |
|---|---|
| [`PRD.md`](./PRD.md) | What this is, why, non-goals, feature build order, success criteria |
| [`AGENTS.md`](./AGENTS.md) | How any coding agent (Claude Code included) should work in this repo — build order, data model rules, coordinate system rules, what "done" means |
| [`UI.md`](./UI.md) | Layout and interaction behavior |
| [`STYLING.md`](./STYLING.md) | Visual system — color, typography, spacing |

> [!IMPORTANT]
> All four are living documents. If something in the code diverges from a doc, the doc is expected to be updated in the same pass — see `AGENTS.md` §3 and §6.

---

## Getting started

```bash
bun install
bun run dev
```

Requires Node (LTS). No environment variables or backend setup needed for local development in the current milestone.

---

## Build order

Foundation → Canvas-only boards → PDF import + direct markup → Linked side-canvases → Cross-layer drawing → Polish (export, shortcuts, search). Full detail in `PRD.md` §5.

> [!IMPORTANT]
> Do not skip ahead in the build order — see `AGENTS.md` §2 for why the order matters.

---

## Development

```bash
bun run dev         # start the dev server
bun test             # run the test suite once
bun test:watch       # run tests in watch mode
bun run build        # production build
bun run lint         # eslint
```

---

## Status

Early build. Currently in the **Foundation milestone** (see `PRD.md` §5): project scaffold, tldraw integration, IndexedDB schema, coordinate transform system, and notebook navigation — no user-facing canvas/PDF features yet.

---

## License

Personal project, not currently licensed for reuse.
