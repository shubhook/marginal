# Marginal — Spec, Short Version

A skimmable condensation of [`PRD.md`](../../PRD.md). For full feature-level and schema-level detail, see [`build-order.md`](../build-order.md) and [`data-model.md`](../data-model.md) in `docs/` instead of expecting it here.

## The problem

Existing tools force a tradeoff: canvas apps (like Excalidraw) have no PDF support; PDF-and-canvas hybrids (like Notability/GoodNotes) aren't local-first or extensible; structured-note apps (like Obsidian/Notion) have poor freeform drawing and no native PDF markup. Marginal combines canvas + PDF markup + notebook structure without vendor lock-in, running entirely locally with no server dependency for the core loop.

## Non-goals (explicit — deliberately ruled out, not just unbuilt)

- **Multi-user collaboration** — not planned; would need an entirely different sync architecture.
- **Mobile-first design** — desktop trackpad/mouse is the target input for v1.
- **General-purpose PDF editing** (merging, splitting, form-filling) — this is a notes tool, not a PDF utility.
- **Cross-device sync** — deferred until a backend exists.

These are defaults, not permanent walls — revisit explicitly if real usage shows one is needed sooner, don't just build around it quietly.

## The core structure

```
Notebook
 ├── Board            (a standalone infinite canvas)
 └── PDFDocument
      └── Page         (fixed size, matches the source PDF page)
           └── Canvas  (one or more named layers on that page;
                        only one is visible at a time)
```

A Notebook holds Boards and PDFs. A PDF has Pages. Each Page can have several independent, named canvases layered on top of it — switching canvases swaps which one's notes are showing.

No schema fields here on purpose — see [`data-model.md`](../data-model.md) for the real interfaces.

## Success looks like

- Taking freeform notes feels as fast and frictionless as a dedicated canvas app.
- Marking up a PDF reading doesn't require exporting to another app.
- The notebook structure holds up over a real semester of notes, not just a demo.

If any of these three stop being true in practice, that's a signal to revisit the plan — not to push through.

## More detail

- Full milestone-by-milestone build order: [`build-order.md`](../build-order.md)
- Full data model and schema: [`data-model.md`](../data-model.md)
