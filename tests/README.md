# tests/

Unit tests for Marginal, mirroring the structure of the source they test — `tests/storage/` tests `src/storage/`, `tests/canvas/` tests `src/canvas/`, `tests/components/` tests `app/components/`, one test file per module under test.

**Run:** `bun test` (or `bun test --watch` for TDD). Test discovery/preload config lives in `bunfig.toml` at the repo root.

Per AGENTS.md §6, pure-logic modules — coordinate transforms (`coordinates.ts`), tag/visibility/camera state (`canvasState.ts`), and IndexedDB cascades (`db.ts`) — are the priority for coverage, since bugs there are hard to trace once UI is built on top. UI/component rendering is not comprehensively tested by design; this was an earlier, deliberate decision to defer broad UI testing until post-MVP churn settled.
