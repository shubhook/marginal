# **Marginal Documentation**

The technical reference for developing Marginal.

**This folder is the working documentation set for Marginal's architecture, data model, and subsystems.** It covers system design, entity relationships, the coordinate system, storage layer, UI/interaction rules, and styling conventions — the material a contributor (human or agent) needs before touching code.

[Overview](#overview) · [Documentation Structure](#documentation-structure) · [Quick Start for Contributors](#quick-start-for-contributors) · [Key Principles](#key-principles) · [Current Status](#current-status)

---

## Overview

Marginal is a **local-first notebook tool** combining three surfaces:
- Infinite freeform canvas (Excalidraw-like)
- PDF viewer with direct markup
- Linked side-canvases for expanded notes

Built for one user (Khakha) for daily personal use: coursework notes, project sketches, PDF markup on readings.

> [!NOTE]
> Just here to get oriented, not to write code or run an agent session? [`docs/human/`](./human/README.md) is a short, plain-language layer on top of this folder — a few minutes' read instead of the full set below.

---

## Documentation Structure

| File | Purpose |
|---|---|
| [`architecture.md`](./architecture.md) | System design, entity relationships, and technical foundations |
| [`build-order.md`](./build-order.md) | Development milestones and feature phases |
| [`development.md`](./development.md) | How to work in this codebase |
| [`data-model.md`](./data-model.md) | Schema, entities, and storage patterns |
| [`coordinates.md`](./coordinates.md) | PDF/canvas/screen space conversions |
| [`storage.md`](./storage.md) | IndexedDB, Dexie, data access layer |
| [`ui-interaction.md`](./ui-interaction.md) | Layout, navigation, keyboard shortcuts |
| [`styling.md`](./styling.md) | Colors, typography, visual conventions |
| [`contributing.md`](./contributing.md) | How to contribute safely and effectively |

---

## Quick Start for Contributors

1. Read [Development Guidelines](./development.md) first — it explains the philosophy and constraints.
2. Check the [Build Order](./build-order.md) to understand where you are in the project.
3. Review the relevant subsystem doc (Coordinates, Storage, UI, etc.).
4. See [Contributing](./contributing.md) for workflow and testing.

---

## Key Principles

- **Single-user, local-first** — optimize for daily personal use, not generality.
- **Coordinate transforms first** — validate in isolation before any UI touches them.
- **Restrained design** — no decorative effects, negative space is a feature.
- **Explicit over implicit** — flag ambiguities instead of silently choosing the "safe" option.

> [!IMPORTANT]
> Strict build order: Foundation → Surface 1 → Surface 2 → Surface 3 → Cross-layer → Polish. Don't skip ahead.

---

## Current Status

**Foundation milestone (complete):**
- ✅ Next.js scaffold with App Router, TypeScript, Tailwind
- ✅ tldraw integration (renders without errors)
- ✅ Dexie IndexedDB schema with all entities
- ✅ Coordinate transform system (12 passing tests)
- ✅ Notebook CRUD + sidebar navigation
- ✅ Custom delete confirmation dialog

**Next:** Surface 1 (Canvas-only mode) — infinite canvas with pan/zoom/draw/shapes/text.
