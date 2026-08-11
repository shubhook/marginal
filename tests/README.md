# **tests/**

Unit tests for Marginal, mirroring the structure of the source they test.

**Each source module gets one test file, under a mirrored path** — `tests/storage/` tests `src/storage/`, `tests/canvas/` tests `src/canvas/`, `tests/components/` tests `app/components/`. Tests are not colocated with source.

[Structure](#structure) · [Running Tests](#running-tests) · [Coverage Priority](#coverage-priority)

---

## Structure

| Test path | Tests source at |
|---|---|
| `tests/storage/` | `src/storage/` |
| `tests/canvas/` | `src/canvas/` |
| `tests/components/` | `app/components/` |

---

## Running tests

```bash
bun test          # run once
bun test --watch  # TDD loop
```

Test discovery/preload config lives in `bunfig.toml` at the repo root.

---

## Coverage priority

> [!NOTE]
> Per `AGENTS.md` §6, pure-logic modules — coordinate transforms (`coordinates.ts`), tag/visibility/camera state (`canvasState.ts`), and IndexedDB cascades (`db.ts`) — are the priority for coverage, since bugs there are hard to trace once UI is built on top. UI/component rendering is not comprehensively tested by design — an earlier, deliberate decision to defer broad UI testing until post-MVP churn settled.
