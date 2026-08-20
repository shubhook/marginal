# Contributing Guide

How to contribute safely and effectively to Marginal.

## Before You Start

1. **Read [Development Guidelines](./development.md)** — the "why" behind how we work
2. **Check the [Build Order](./build-order.md)** — know which milestone you're in
3. **Review relevant docs** — if touching coordinates, read [Coordinate System](./coordinates.md); if touching storage, read [Storage & Persistence](./storage.md)

## Workflow

### Pick a Task

- Check [Build Order](./build-order.md) — are there incomplete tasks in the current milestone?
- Don't skip ahead to a later milestone
- If the current milestone needs multiple features, build them one at a time (separate branches/PRs)

### Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Branch naming (not strict, but clear):
- `feature/add-pdf-import`
- `fix/coordinate-rounding-error`
- `refactor/storage-layer`

### Code

Follow [Development Guidelines](./development.md):

1. Keep coordinate math isolated (use pure functions, test in isolation)
2. Keep data access behind the interface (`src/storage/db.ts`)
3. Update docs if you change schema or architecture
4. No premature abstractions

**Code review checklist:**
- [ ] TypeScript strict mode passes
- [ ] No `console.error` or `TODO` left uncommitted
- [ ] No hydration warnings on first load
- [ ] Previous features still work (regression check)

### Test

**Unit tests** (infrastructure):
```bash
bun src/canvas/coordinates.test.ts  # Should all pass
```

**Manual testing** (UI/UX):
1. Start dev server: `bun run dev`
2. Test golden path for your feature
3. Test boundary cases (edge cases listed in relevant milestone description)
4. Reload page (persistence check)
5. Spot check previous features (regression)

### Commit

Format: `<type>: <short description>`

```bash
git commit -m "feat: add PDF page navigation arrows

- Navigate between pages via left/right arrow buttons
- Arrow buttons in top-right corner of page
- Keyboard shortcuts: left/right arrows also work
- Previous surface (direct markup) still functional"
```

Good commits:
- One logical change per commit
- Clear, descriptive message
- Include rationale if doing something non-obvious

### Push & Create PR (Optional for Personal Project)

```bash
git push origin feature/your-feature-name
```

If creating a PR (useful for major features):

```markdown
## What

Add PDF page navigation arrows to flip between pages.

## Why

Current milestone (Surface 2) requires navigating multi-page PDFs. This unblocks testing Surface 3 (linked canvases) later.

## How

- Added arrow buttons in top-right of page
- Keyboard shortcuts (← / →) also work
- Arrows disabled on first/last page

## Testing

- ✓ Can navigate 5-page PDF front-to-back
- ✓ Arrows disabled appropriately
- ✓ Keyboard shortcuts work
- ✓ Markup persists across page navigation
```

## Common Tasks

### Adding a New Data Entity

1. **Create TypeScript interface** in `src/storage/types.ts`
2. **Add Dexie table** in `src/storage/db.ts` constructor
3. **Implement CRUD functions** in `src/storage/db.ts`
4. **Update [Data Model doc](./data-model.md)** with entity details
5. **Test CRUD** manually: create, read, update, delete
6. **Commit** with message like: `feat: add Message entity with CRUD operations`

### Adding a UI Component

1. **Create component** in `app/components/YourComponent.tsx` (mark as `"use client"` if using hooks)
2. **Style per [Styling Guide](./styling.md)** (dark theme, Tailwind, 1px borders)
3. **Test on real app** — not just "does it render"
4. **No TypeScript errors** — strict mode
5. **Commit** with message like: `feat: add message input component`

### Fixing a Bug

1. **Reproduce** the bug manually (don't fix blindly)
2. **Identify root cause** — is it coordinates, storage, UI state, or rendering?
3. **Write minimal fix** — don't refactor while fixing; one concern per commit
4. **Test regression** — did the fix break anything else?
5. **Commit** with message like: `fix: stroke offset at high zoom due to rounding error`

### Adding Tests

1. **Only for infrastructure** (coordinates, math, storage CRUD)
2. **Write clear test names** describing what's being tested
3. **Use realistic examples** (not trivial cases)
4. **Keep tolerance reasonable** (0.0001 for coordinate rounding)
5. **Commit** with message like: `test: add zoom-centering tests`

## Red Flags

### ❌ Don't Do This

- **Skipping build order** — "I'll just build Surface 3 real quick"
  - *Reason:* Breaks traceability; bugs in later surfaces leak back to earlier ones
  - *Fix:* Finish current milestone first

- **Inlining coordinate math** — computing screen→pdf conversions inside event handlers
  - *Reason:* Hard to test, easy to get wrong, duplicates logic
  - *Fix:* Use pure functions from `src/canvas/coordinates.ts`

- **Direct Dexie access from components** — calling `db.notebooks.add()` directly
  - *Reason:* Tight coupling; swapping storage backend later breaks everything
  - *Fix:* Go through functions in `src/storage/db.ts`

- **Mixing concerns** — one component doing CRUD + rendering + coordinate transforms
  - *Reason:* Hard to test, hard to debug, hard to reuse
  - *Fix:* Separate concerns (CRUD in hooks, transforms in utils, rendering in components)

- **Ignoring hydration warnings** — "it works, so it's fine"
  - *Reason:* Server/client mismatch causes flaky bugs, especially during refactors
  - *Fix:* Fix the warning or suppress explicitly with rationale

- **Updating docs days later** — "I'll update the schema doc after the feature is built"
  - *Reason:* Docs drift; next contributor gets wrong picture
  - *Fix:* Update docs in same commit that changes schema/architecture

### ⚠️ Yellow Flags (Ask First)

- **Schema changes** — Commit message should explain why
- **Deviating from build order** — Stop and ask if it's necessary
- **Adding new dependencies** — Prefer what's already there (Tailwind, tldraw, Dexie)
- **Changing coordinate system** — Very risky; impacts everything downstream
- **Adding third-party data sync** — v1 is offline-only; ask before integrating anything

## Code Review Checklist

If you're reviewing someone's work:

- [ ] Does it match the [Build Order](./build-order.md)? (Not skipping ahead?)
- [ ] Are coordinate transforms isolated and testable?
- [ ] Is data access going through `src/storage/db.ts`?
- [ ] Does it update relevant docs?
- [ ] No TypeScript errors?
- [ ] No console warnings or errors?
- [ ] Did you actually test it in the app, not just read the code?
- [ ] No regression in previous features (spot check)?

## Performance & Optimization

- **Don't optimize prematurely** — correct is more important than fast
- **Trust infrastructure** — tldraw and Dexie are proven
- **Profile before optimizing** — if something is slow, measure it first
- **For single-user local tool** — premature optimization is almost always wasted effort

## Security & Safety

- **No SQL injection** (no SQL; using Dexie)
- **No XSS** (React escapes by default; only risk if using `dangerouslySetInnerHTML`)
- **No sensitive data** (personal tool, local storage only)
- **Validate file uploads** (future, when PDF import added)

## Documentation

If you add a feature, update docs **in the same commit**:

| Commit Type | Update These Docs |
|-------------|-------------------|
| New entity | [Data Model](./data-model.md) |
| New UI component | [UI & Interaction](./ui-interaction.md) |
| New coordinate logic | [Coordinate System](./coordinates.md) |
| Styling changes | [Styling](./styling.md) |
| New storage pattern | [Storage & Persistence](./storage.md) |
| Completed milestone | [Build Order](./build-order.md) (mark ✅) |

## Questions & Ambiguity

Per [Development Guidelines](./development.md) §7:

> If a design decision is ambiguous, don't silently pick the "safe generic" option. Flag the tradeoff plainly and ask.

Examples:
- "Should notebook order be user-editable (drag to reorder) or auto? Both are possible. Tradeoff: ..."
- "IndexedDB quota could be exceeded if notebooks get very large. Should we warn the user at 80% quota, or just let them hit the limit?"

**Better to ask and wait** than to build something that needs ripping out later.

## Merging & Shipping

For this personal project:
- No strict PR review required
- But do self-review before committing
- Run tests before pushing
- Check regression before marking milestone complete

## Getting Stuck

1. **Read the relevant doc** — often answers the question
2. **Check `git log`** — see how similar features were built before
3. **Test in isolation** — does the coordinate test pass? Does the CRUD function work?
4. **Rubber duck** — explain the problem out loud (often finds the bug)
5. **Ask** — better than banging head against wall

## Version Bumping & Releases

Not doing formal releases in v1. Just commit to main when a milestone is complete.

Tag milestones in git:
```bash
git tag -a v0.1-foundation -m "Foundation milestone complete"
git push origin v0.1-foundation
```

## Feedback & Iteration

This guide will evolve. If something in this doc doesn't match reality:
- Update the doc (don't just work around it)
- Note the change in commit message
- This keeps future contributors informed

---

**Welcome, and thank you for contributing to Marginal.** 🎨
