# STYLING.md — Marginal

> Visual system: color, typography, spacing, component style. Covers *what things look like*, not layout/behavior (see UI.md). This reflects existing personal design sensibility — restrained, no effect-stacking — and should evolve only if it stops feeling right in daily use, not on a whim.

**Version:** 0.1
**Last updated:** 2026-08-04

---

## 1. Design principles

- Restrained over decorative. No glassmorphism, no stacked drop-shadows, no gratuitous gradients.
- Negative space is a feature — the canvas/PDF is the content; UI chrome should recede.
- Dark-first. Default to a dark canvas background; light mode is a later nice-to-have, not required for v1.
- Monochrome base, single accent color used sparingly (selection state, active tool indicator) — not scattered across the UI.

## 2. Color system

Base palette (exact hex values to be finalized against Tailwind config, these are starting points):

| Token | Value (approx.) | Use |
|---|---|---|
| `bg-canvas` | near-black (`#121212`–`#151515`) | Canvas/PDF working surface |
| `bg-chrome` | slightly lighter than canvas (`#1c1c1e`) | Sidebar, toolbar, panel backgrounds |
| `stroke-default` | off-white (`#e8e8e8`) | Default pen/text stroke color |
| `border-subtle` | low-contrast gray (`#2a2a2a`) | Panel dividers, thin UI borders (1px, never thicker) |
| `accent` | single chosen accent (TBD — candidate: a muted blue or amber, not saturated) | Selection outline, active tool state, active tab indicator only |
| `text-primary` | `#f0f0f0` | UI labels |
| `text-muted` | `#8a8a8a` | Secondary UI text (timestamps, hints) |

Rule: accent color should appear in at most one or two places on screen at once. If a screen has three different accent-colored elements simultaneously, that's a styling bug, not a variation.

## 3. Typography

- UI font: system font stack or a single chosen sans (match existing preference — Victor Mono is your editor font; UI can stay sans for readability at small sizes, monospace optionally for any code/technical labels if they appear).
- No more than two font sizes for UI chrome (e.g. 13px body, 11px secondary/meta) — resist the urge to introduce a third "in-between" size.
- Canvas text tool: user-adjustable size/font is a canvas feature, not a UI-chrome concern — governs the note content, not the app shell.

## 4. Spacing & borders

- 1px borders only for UI chrome dividers — no 2px+ borders anywhere, that reads as heavy/dated.
- Consistent spacing scale (4px base unit — 4/8/12/16/24/32) rather than arbitrary pixel values scattered through components.
- No drop shadows on flat UI panels (sidebar, toolbar). A shadow is acceptable only for genuinely floating elements needing depth cue (the floating toolbar pill, popovers) — and even then, subtle, single-layer, not stacked.

## 5. Toolbar (floating pill)

- Bottom-center, rounded-full container, `bg-chrome` background, 1px `border-subtle` border, single subtle shadow for lift off the canvas.
- Icon-only buttons (no text labels) — tool identity should be learnable via icon + keyboard shortcut tooltip, not permanent text clutter.
- Active tool indicated via `accent` color on the icon or a subtle background fill — not both simultaneously (avoid double-emphasis).

## 6. Sidebar

- `bg-chrome` background, 1px right border (`border-subtle`) separating it from the main surface.
- Notebook list: flat list, no nested tree UI (matches the flat-hierarchy decision in PRD.md — don't build tree-expand UI for a hierarchy that doesn't exist).
- Active notebook/board/PDF highlighted with a subtle background tint, not a bright accent block — keep it quiet.

## 7. PDF page + linked canvas panel

- PDF page rendered with a thin `border-subtle` outline against the dark canvas background, so its edges are legible without a heavy frame.
- Linked canvas panel tabs: minimal, text-label tabs (canvas name or "Canvas 1/2/3" default), active tab marked with `accent` underline only — not a filled background, keep it light.

## 8. What to avoid (explicit, since these are common defaults elsewhere)

- No Material-Design-style elevation/shadow stacking.
- No neumorphism.
- No colorful multi-hue icon sets — icons should be single-color (inherit `text-primary` / `accent`), matching the monochrome-first system.
- No rounded-everything softness overload — pick one border-radius scale (e.g. 6px for panels, full-round only for the toolbar pill and circular buttons) and stay consistent.

## Changelog

- 2026-08-04 — Initial STYLING.md drafted alongside PRD, AGENTS, and UI docs. Exact accent color and font stack marked TBD — finalize once building the actual Tailwind config.
