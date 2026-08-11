# Marginal — Status

> **For future updates:** update this after each milestone lands — one short entry, not a full session summary. Session-level detail belongs in git commit messages and the agent-facing [`build-order.md`](../build-order.md), not here.

**Current state (2026-08-11):** all of Marginal's core surfaces are working — notebooks, boards, PDF import with direct markup, named linked canvases per PDF page, export (PNG/SVG/PDF), name search, and trash + drag-to-reorder for notebooks, boards, PDFs, and canvas tabs. Explicitly deferred, not forgotten: a custom toolbar restyle (tldraw's stock toolbar is used as-is for now), and everything backend-shaped — multi-device sync, OCR, mobile/touch support — none of which are planned unless a real need for them shows up.

| Milestone | Status |
|---|---|
| Foundation (scaffold, coordinate system, notebook nav) | Done |
| Surface 1 — Canvas-only boards | Done |
| Surface 2 — PDF import & direct markup | Done |
| Surface 3 — Linked side-canvases | Done |
| Cross-layer drawing → single-canvas architecture | Done (superseded by a simpler one-canvas-per-page design) |
| Polish — export, shortcuts, search | Done (toolbar restyle still deferred) |
| Trash & Reordering | Done |
| Backend / multi-device sync / OCR | Not started — no trigger yet |

Full milestone detail, acceptance criteria, and verification notes: [`build-order.md`](../build-order.md).
