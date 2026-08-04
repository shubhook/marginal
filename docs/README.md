# Marginal Documentation

Comprehensive guide for understanding, developing, and contributing to Marginal.

## Overview

Marginal is a **local-first notebook tool** combining three surfaces:
- Infinite freeform canvas (Excalidraw-like)
- PDF viewer with direct markup
- Linked side-canvases for expanded notes

Built for one user (Khakha) for daily personal use: coursework notes, project sketches, PDF markup on readings.

## Documentation Structure

- **[Architecture](./architecture.md)** — System design, entity relationships, and technical foundations
- **[Build Order & Roadmap](./build-order.md)** — Development milestones and feature phases
- **[Development Guidelines](./development.md)** — How to work in this codebase
- **[Data Model](./data-model.md)** — Schema, entities, and storage patterns
- **[Coordinate System](./coordinates.md)** — PDF/canvas/screen space conversions
- **[Storage & Persistence](./storage.md)** — IndexedDB, Dexie, data access layer
- **[UI & Interaction](./ui-interaction.md)** — Layout, navigation, keyboard shortcuts
- **[Styling System](./styling.md)** — Colors, typography, visual conventions
- **[Contributing](./contributing.md)** — How to contribute safely and effectively

## Quick Start for Contributors

1. Read **[Development Guidelines](./development.md)** first — it explains the philosophy and constraints
2. Check the **[Build Order](./build-order.md)** to understand where you are in the project
3. Review the relevant subsystem doc (Coordinates, Storage, UI, etc.)
4. See **[Contributing](./contributing.md)** for workflow and testing

## Key Principles

- **Single-user, local-first** — optimize for daily personal use, not generality
- **Strict build order** — Foundation → Surface 1 → Surface 2 → Surface 3 → Cross-layer → Polish. Don't skip ahead.
- **Coordinate transforms first** — validate in isolation before any UI touches them
- **Restrained design** — no decorative effects, negative space is a feature
- **Explicit over implicit** — flag ambiguities instead of silently choosing the "safe" option

## Current Status

**Foundation milestone (complete):**
- ✅ Next.js scaffold with App Router, TypeScript, Tailwind
- ✅ tldraw integration (renders without errors)
- ✅ Dexie IndexedDB schema with all entities
- ✅ Coordinate transform system (12 passing tests)
- ✅ Notebook CRUD + sidebar navigation
- ✅ Custom delete confirmation dialog

**Next:** Surface 1 (Canvas-only mode) — infinite canvas with pan/zoom/draw/shapes/text
