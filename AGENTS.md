<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- More Agents rules and conventions -->
# AGENTS.md — Marginal

> How any coding agent (Claude Code, or a future contributor) should operate in this repo. Read this before touching code. This file changes as the project's actual constraints become clearer — treat it as current operating procedure, not permanent law.

**Version:** 0.1
**Last updated:** 2026-08-04

---

## 1. What kind of project this is

Single-user, local-first, no backend (yet). Optimize decisions for "Khakha uses this daily and it doesn't break," not for generality, configurability, or hypothetical other users. If a choice trades simplicity for flexibility nobody asked for, take simplicity.

Read `PRD.md` for product intent, `UI.md` for interaction/layout rules, `STYLING.md` for visual system before writing any UI code. This file governs *how you work*, those govern *what you build*.

## 2. Build order — do not skip ahead

The PRD defines a strict build order: Foundation → Notebook nav → Surface 1 (canvas) → Surface 2 (PDF direct markup) → Surface 3 (linked canvases) → Cross-layer drawing → Polish.

Reasons this order exists, not just convention:
- The coordinate-transform system is infrastructure every later surface depends on. It must be validated in isolation (write a small test/demo proving PDF-space ↔ canvas-space ↔ screen-space conversion is correct) before any UI is built on top of it. If this is wrong, every surface built on it will misbehave in ways that are hard to trace back to the root cause.
- Cross-layer drawing (Section 6) explicitly depends on Surface 2 and Surface 3 both already working. Do not attempt it earlier — there's nothing to test it against.
- Each surface should reach a genuinely working, manually-verified state before the next begins. Don't move to the next milestone with a known-broken previous one "to fix later."

If asked to build multiple surfaces in one session, push back and suggest splitting into separate sessions/commits — this isn't bureaucracy, it's what keeps bugs traceable to a specific layer.

## 3. Data model rules

Current schema lives in `PRD.md` §4. Rules for changing it:

- `Notebook`, `Board`, `PDFDocument`, `Page`, `Canvas` are the current top-level entities. Any schema change should be reflected back into `PRD.md` §4 in the same commit/session — the doc and the code must not drift.
- Notebook hierarchy is flat (no nesting) by deliberate decision — don't add nesting speculatively. If it's genuinely needed, that's a PRD-level decision to revisit explicitly, not a quiet schema addition.
- Cross-layer strokes (PDF↔canvas continuous drawing) are stored as two linked segments sharing a `strokeGroupId`, not as one unified element — the two halves live in different coordinate spaces and must be able to render independently if either panel's pan/zoom changes.

## 4. Coordinate system — the one thing to get right

Three coordinate spaces exist: PDF-page space (fixed, matches source page dimensions), canvas space (independent per-Canvas, has its own pan/zoom), and screen space (what the user's pointer actually reports).

- Write the transform functions (`pdfToWorld`, `worldToPdf`, equivalent for canvas space) as isolated, independently testable functions — not inlined into event handlers.
- Any feature touching drawing, PDF rendering, or panel layout should reuse these functions, not compute its own coordinate math.
- When debugging anything that looks like "the stroke is in the wrong place," check this layer first before assuming the bug is elsewhere.

## 5. Storage rules

- IndexedDB via Dexie is the only persistence layer for v1. No backend calls, no fetch to external services for core functionality.
- Every write should be synchronous-feeling to the user (optimistic local update) even though Dexie is async under the hood — don't block the UI on writes.
- When the backend eventually exists (see PRD §7), IndexedDB's role changes to local cache/offline layer, not source of truth. Don't build storage logic today that assumes IndexedDB will always be the only source of truth — keep the data access layer behind a small interface so swapping in a sync layer later doesn't require rewriting every call site.

## 6. What "done" means for a milestone

A milestone (as listed in PRD §5) is done when:
1. It works via manual interaction, not just "the code compiles."
2. It doesn't break a previously-working milestone (spot check the previous surface still functions).
3. Any schema or architecture change it required is reflected in PRD.md / this file in the same pass.

Don't mark something done because the happy path renders once. Click around it. Try the boundary cases mentioned in the relevant milestone description (e.g. for cross-layer drawing: what happens if you pan mid-stroke, what happens if you zoom one panel after drawing).

## 7. When in doubt

This is a personal tool for one user with a known, direct communication style. If a design decision is ambiguous, don't silently pick the "safe generic" option — flag the tradeoff plainly and let Khakha decide, the way these docs were built: state the options, state the honest cost of each, wait for a call rather than guessing.

## Changelog

- 2026-08-04 — Initial AGENTS.md drafted alongside PRD.