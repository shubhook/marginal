# Styling System

Colors, typography, spacing, and visual conventions.

## Design Principles

1. **Restrained** — no decorative effects, no stacked shadows, no gradients
2. **Negative space is a feature** — UI chrome recedes; canvas/PDF is the star
3. **Dark-first** — dark theme by default (light mode is future nice-to-have)
4. **Monochrome + single accent** — mostly grayscale, accent used sparingly (selection, active tool)

## Color Palette

All values in hex. Tailwind classes used in code (e.g., `bg-[#1c1c1e]` instead of `dark:bg-gray-800`).

| Token | Hex | Tailwind | Use |
|-------|-----|----------|-----|
| `bg-canvas` | `#121212` | — | Canvas/PDF working surface |
| `bg-chrome` | `#1c1c1e` | — | Sidebar, toolbar, panels |
| `border-subtle` | `#2a2a2a` | — | Dividers, thin UI borders (1px only) |
| `text-primary` | `#f0f0f0` | — | UI labels, primary text |
| `text-muted` | `#8a8a8a` | — | Secondary text, disabled state |
| `accent` | TBD | — | Selection outline, active tool (use sparingly) |

**Exact accent:** TBD — choose muted blue or amber, not saturated. Test against dark backgrounds.

## Typography

- **UI font:** System font stack or single sans (Victor Mono for code references only)
- **Canvas text tool:** User-adjustable (separate from UI chrome font)

### Font Sizes

Two tiers for UI (resist third size):
- **Body:** 13px / 0.8125rem (main UI text)
- **Secondary:** 11px / 0.6875rem (meta, timestamps, disabled)

## Spacing & Layout

**Base unit:** 4px

Scale: 4, 8, 12, 16, 24, 32, 48, 64

- `p-2` = 8px padding
- `p-3` = 12px padding
- `p-4` = 16px padding
- Use multiples of 4; avoid arbitrary sizes

## Borders

**1px only** for UI dividers. No 2px or thicker.

- `border-subtle` color for panel/sidebar borders
- Radius: 6px for panels and modals, `rounded-full` (12px) for toolbar pill and circular buttons

## Shadows

**Avoid drop shadows** on flat panels (sidebar, toolbar background).

**Single subtle shadow only** for floating elements (dialog overlay, tooltips):
```css
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
```

No stacked shadows. No heavy depth cues.

## Components

### Sidebar

- Background: `bg-chrome` (`#1c1c1e`)
- Border: 1px `border-subtle` on right
- Width: 16rem (256px)
- Text: `text-primary` at 13px
- Secondary text: `text-muted` at 11px

**Active notebook item:**
- Background: `#2a2a2a` (subtle, not bright)
- Text: `text-primary`

**Hover notebook item:**
- Background: `#252525` (slightly lighter)
- Text: `text-primary`

**Edit/delete buttons (on hover):**
- Icon color: `text-muted` until hovered
- On hover: `text-primary`
- Delete button: red-tinted on hover (`text-red-500`)

### Toolbar (Floating Pill)

- Background: `bg-chrome`
- Border: 1px `border-subtle`
- Shape: `rounded-full` (12px radius)
- Shadow: subtle (0 2px 8px rgba(0,0,0,0.3))
- Position: bottom-center, fixed

**Icon buttons:**
- Inactive: `text-muted` icon
- Active: `accent` color or subtle background (not both)
- Hover: slight background tint (200ms transition)

### Dialog / Modal

**Background overlay:**
- Color: `#000000` with 50% opacity (`bg-black/50`)
- Covers entire viewport (z-index: 50)

**Dialog box:**
- Background: `bg-chrome`
- Border: 1px `border-subtle`
- Radius: 6px
- Padding: 24px (1.5rem)
- Max-width: 28rem
- Shadow: subtle

**Dialog title:**
- Color: `text-primary`
- Size: 14px, font-weight: 600

**Dialog message:**
- Color: `text-muted`
- Size: 13px
- Margin-bottom: 24px

**Button group:**
- Justify: end (right-aligned)
- Gap: 12px

**Cancel button:**
- Background: `bg-black`
- Border: 1px `border-subtle`
- Color: `text-primary`
- Hover: `bg-[#2a2a2a]`

**Confirm/Delete button (danger variant):**
- Background: `bg-red-900/30`
- Border: 1px `border-red-900/50`
- Color: `text-red-400`
- Hover: `bg-red-900/50`

### PDF Page Outline

- Border: 1px `border-subtle` around rendered page
- Keeps edges legible against dark canvas background

### Linked Canvas Panel Tabs

- Inactive tab: text in `text-muted`
- Active tab: text in `text-primary` with `accent` underline (not filled background)
- Underline thickness: 2px
- Transition: 200ms

## Interactive States

| State | Style | Duration |
|-------|-------|----------|
| Hover | background change | 200ms |
| Active/Focus | accent underline or color | instant |
| Disabled | `text-muted`, pointer none | instant |
| Loading | no spinner; rely on optimistic updates | — |
| Error | text in `text-red-400` | instant |

## Dark/Light Mode (Future)

v1 is dark-only. When light mode added:
- Use CSS variables or Tailwind dark: modifier
- Keep same contrast ratios
- Invert palette but preserve relationships

Placeholder for future: `@media (prefers-color-scheme: light)`.

## What to Avoid (Explicit)

- ❌ Rounded-everything (too soft)
- ❌ Multiple accent colors on one screen
- ❌ Material Design elevation/shadow stacking
- ❌ Neumorphism
- ❌ Colorful icon sets (use monochrome)
- ❌ Animated gradients or bouncy transitions
- ❌ Transparent glassmorphism effects

## Icons

Not yet integrated (tldraw handles drawing tool icons). When adding:
- Use monochrome icons (inherit `text-primary` or `accent`)
- 16px or 24px sizes
- Single-color only

## Code Examples

### Sidebar Item

```tsx
<div className="px-3 py-2 rounded text-xs cursor-pointer bg-[#2a2a2a] text-[#f0f0f0] hover:bg-[#252525]">
  {notebook.name}
</div>
```

### Toolbar Button

```tsx
<button className="p-2 rounded-full hover:bg-[#2a2a2a] transition-colors text-[#8a8a8a] hover:text-[#f0f0f0]">
  {icon}
</button>
```

### Dialog

```tsx
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  <div className="bg-[#1c1c1e] border border-[#2a2a2a] rounded-lg p-6">
    {/* content */}
  </div>
</div>
```

## Figma or Design Tools (Future)

When a design tool is introduced, document:
- Component library (buttons, inputs, dialogs)
- Color library (link to this doc)
- Typography styles

For now, code is the source of truth.

## Performance

- No animations on scroll or heavy operations
- Hover transitions are subtle (200ms, not 500ms+)
- No layout thrashing (avoid frequent reflows)

## Testing Styling

Manual verification:
1. Open dark mode (browser dev tools)
2. Check contrast ratios (Chrome DevTools Lighthouse)
3. Spot check colors against backgrounds
4. Test hover states
5. Resize window (responsive check)

## Brand Evolution

This system is personal and reflects actual preferences. Update as real usage reveals what feels right. Don't change on a whim; let patterns emerge from use.
