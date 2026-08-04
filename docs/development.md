# Development Guidelines

How to work safely and effectively in this codebase.

## Core Principles

### 1. Single-User, Local-First Optimization

This is a **personal tool for one user** with direct communication. Optimize for "Khakha uses this daily and it doesn't break," not for generality or hypothetical other users.

**Implication:** If a choice trades simplicity for flexibility nobody asked for, take simplicity.

### 2. Don't Skip the Build Order

Foundation → Notebook nav → Surface 1 (canvas) → Surface 2 (PDF) → Surface 3 (linked canvases) → Cross-layer → Polish.

**Why:** Infrastructure (coordinate transforms) must be validated in isolation before any UI depends on it. If the math is wrong, every surface inherits the bug.

**What to do if asked to build multiple surfaces:**
- Push back politely
- Suggest splitting into separate sessions/commits
- This keeps bugs traceable to a specific layer

### 3. Coordinate System is Critical

Three coordinate spaces (PDF, canvas/world, screen) with pure conversion functions in `src/canvas/coordinates.ts`.

**Rules:**
- Write transform functions as isolated, independently testable functions — not inlined into event handlers
- Any feature touching drawing, PDF rendering, or panel layout must reuse these functions
- When debugging "the stroke is in the wrong place," check this layer first

### 4. Data Model Rules

Current schema lives in `src/storage/types.ts` and `src/storage/db.ts`.

**When changing schema:**
- Reflect changes back into `docs/data-model.md` in the same commit
- The doc and code must not drift
- Notebook hierarchy is flat (no nesting) — don't add nesting speculatively
- Cross-layer strokes store as two linked segments (shared `strokeGroupId`), not one unified element

### 5. Storage is Behind an Interface

IndexedDB via Dexie is the only persistence layer for v1.

**Rules:**
- Keep the data-access layer behind a small interface (`src/storage/db.ts` exports functions, not direct table access)
- Every write should feel synchronous to the user (optimistic local updates)
- When the backend eventually exists, IndexedDB becomes local cache; this interface shields you from rewrites

### 6. What "Done" Means for a Milestone

A milestone is done when:

1. **It works via manual interaction**, not just "the code compiles"
2. **It doesn't break a previously-working milestone** (spot check the previous surface still functions)
3. **Any schema or architecture change is reflected** in docs in the same pass

Don't mark something done because the happy path renders once. Click around it. Try boundary cases. On cross-layer drawing, test: what happens if you pan mid-stroke? What if you zoom one panel after drawing?

### 7. When in Doubt, Ask

This is a personal tool with a known, direct communication style. If a design decision is ambiguous, don't silently pick the "safe generic" option.

**Instead:** Flag the tradeoff plainly, state the options, state the honest cost of each, wait for a call.

## File Structure

```
marginal/
├── app/
│   ├── components/
│   │   ├── AppContainer.tsx       (main layout, state management)
│   │   ├── Sidebar.tsx            (notebook list, CRUD)
│   │   ├── Editor.tsx             (tldraw wrapper)
│   │   └── DeleteConfirmationDialog.tsx
│   ├── layout.tsx                 (root, dark theme setup)
│   └── page.tsx                   (main route)
├── src/
│   ├── canvas/
│   │   ├── coordinates.ts         (pure transform functions)
│   │   └── coordinates.test.ts    (unit tests)
│   └── storage/
│       ├── types.ts               (TypeScript interfaces)
│       └── db.ts                  (Dexie schema, data access)
├── docs/                          (this documentation)
├── AGENTS.md                      (deprecated; see docs/)
├── PRD.md                         (deprecated; see docs/)
├── UI.md                          (deprecated; see docs/)
├── STYLING.md                     (deprecated; see docs/)
└── package.json
```

**Note:** Original AGENTS.md, PRD.md, UI.md, STYLING.md are kept for reference but superseded by docs/.

## Code Style

- **TypeScript:** Strict mode, no `any` unless unavoidable
- **React:** Use hooks, client components where needed, server components for static layout
- **Naming:** Clear, descriptive; prefer explicit over clever
- **Comments:** Only when WHY is non-obvious (hidden constraints, workarounds, subtle invariants)
- **No premature abstraction:** Three similar lines is better than a premature abstraction

## Testing

### Unit Tests (Infrastructure)
- Coordinate transforms: 12 tests passing
- Data-access layer: basic CRUD operations (create, read, update, delete)

**Run tests:**
```bash
bun src/canvas/coordinates.test.ts
```

### Manual Testing (UI/UX)
- Dev server: `bun run dev`
- Open `localhost:3000`
- Test the golden path + boundary cases for the feature you're building

**Regression checklist at milestone end:**
- [ ] Previous surface still works
- [ ] No console errors
- [ ] No hydration warnings
- [ ] Persistence works (reload page, state persists)

## Git Workflow

### Branching

No strict branch naming, but aim for clarity:
- Feature: `feature/pdf-import`, `feature/cross-layer-drawing`
- Fix: `fix/coordinate-rounding`, `fix/hydration-mismatch`
- Research: `research/ocr-options`

### Commits

Format: `<type>: <short description>`

Types:
- `feat:` new feature
- `fix:` bug fix
- `refactor:` code restructuring (no behavior change)
- `docs:` documentation only
- `test:` test additions/changes

Examples:
```
feat: add PDF import and page rendering
fix: coordinate rounding causing stroke offset
docs: update contributor guide for cross-layer drawing
test: add unit tests for zoom centering
```

### Pull Requests

Not strictly enforced for this personal project, but when doing a major change:
- Describe the "why" (what problem does this solve?)
- Link to any related docs/issues
- Note if you're deviating from the build order or schema

## Common Pitfalls

### 1. Hydration Mismatches
- **Symptom:** Console warning about attribute mismatch on server/client HTML
- **Cause:** Often browser extensions (`cz-shortcut-listen` from Grammarly, etc.)
- **Fix:** Already handled — `suppressHydrationWarning` on html element + deferred rendering in AppContainer

### 2. Coordinate Math Errors
- **Symptom:** Strokes appear in wrong location, especially at different zoom/pan levels
- **Cause:** Inlined coordinate math or incorrect transform usage
- **Fix:** Use the pure functions in `src/canvas/coordinates.ts`, not custom math in event handlers

### 3. Stale Notebook References
- **Symptom:** Deleting a notebook crashes, or active notebook ID doesn't exist
- **Cause:** State not synced with database
- **Fix:** Always update local state after DB operations, handle cascading deletes

### 4. Skipping Manual Testing
- **Symptom:** Code works in isolation but UI feels broken
- **Cause:** Didn't actually use the feature
- **Fix:** Always test the golden path AND boundary cases in the real app

### 5. Schema Drift
- **Symptom:** Code uses fields that aren't in docs, or vice versa
- **Cause:** Updated code without updating docs
- **Fix:** Edit docs and code in the same commit

## Performance Considerations (v1)

- No optimization premature; focus on correctness
- Dexie queries are fast enough for single-user local use
- tldraw is battle-tested; trust its performance
- If real usage reveals slowness, profile before optimizing

## Security Considerations

- No sensitive data stored (local personal tool)
- No network calls to untrusted sources (v1 is offline)
- No SQL injection risk (no SQL, using Dexie)
- Basic validation only at system boundaries (file upload)

## Future Evolution

This guide is a living document. Update it as the project's actual constraints become clearer. Treat it as current operating procedure, not permanent law.
