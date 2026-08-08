# Coordinate System

Understanding and working with three coordinate spaces.

## Three Coordinate Spaces

### PDF-Page Space
- **Fixed dimensions** — matches source PDF page (e.g., 612×792 for US Letter)
- **Fixed origin** — (0, 0) at top-left corner of page
- **Use case:** Markup drawn directly on PDF page
- **Transform:** None; this is the "source of truth" coordinate space for PDFs

### Canvas/World Space
- **Infinite** — can pan and zoom
- **Per-canvas** — each Board or linked Canvas has its own coordinate system
- **Transform:** Offset (pan) + zoom factor
  - `offsetX, offsetY` — where the origin has moved due to panning
  - `zoom` — scale factor (1.0 = 100%, 2.0 = 200%, etc.)
- **Use case:** Drawing on freeform canvas or linked canvas side-panel

### Screen Space
- **Browser viewport** — what the user's mouse/pointer reports
- **Variable** — depends on window size and element positions
- **Transform:** Element offset on page (container's `getBoundingClientRect()`)
- **Use case:** Event handlers (mouse down, move, up) read screen coordinates

## Conversion Functions

All pure functions in `src/canvas/coordinates.ts`. No side effects, no UI dependencies.

```typescript
// PDF-page space ↔ Canvas/World space
pdfToWorld(point: Point, transform: Transform): Point
worldToPdf(point: Point, transform: Transform): Point

// Screen space ↔ Canvas/World space
screenToWorld(screenPoint: Point, containerRect: DOMRect): Point
worldToScreen(worldPoint: Point, containerRect: DOMRect): Point

// One-shot conveniences
screenToWorldInCanvas(screenPoint, containerRect, transform): Point
screenToPdf(screenPoint, containerRect, transform): Point

// Transform operations
applyZoom(transform, factor, centerWorldPoint): Transform
applyPan(transform, delta): Transform
resetTransform(): Transform
```

## Transform Type

```typescript
interface Transform {
  offsetX: number;     // Pan offset in X
  offsetY: number;     // Pan offset in Y
  zoom: number;        // Scale factor (1 = 100%)
}
```

## Examples

### Converting a Mouse Position to PDF Coordinates

```typescript
// User clicks at screen position (150, 250)
const screenPoint = { x: 150, y: 250 };

// Get container rect
const containerRect = canvasElement.getBoundingClientRect();

// Convert to world space (accounting for container offset)
const worldPoint = screenToWorld(screenPoint, containerRect);

// Convert to PDF space (accounting for pan/zoom)
const pdfPoint = worldToPdf(worldPoint, transform);

// pdfPoint is now in PDF-page coordinates
// Draw at this position on the page
```

### Applying Zoom Centered at Mouse Position

```typescript
// User scrolls wheel at screen position (200, 300)
const mouseScreenPoint = { x: 200, y: 300 };
const containerRect = canvasElement.getBoundingClientRect();
const currentTransform = { offsetX: 50, offsetY: 75, zoom: 1 };

// Convert mouse position to world space
const mouseWorldPoint = screenToWorld(mouseScreenPoint, containerRect);

// Apply zoom (zoom in by 1.5x) centered at mouse
const zoomFactor = 1.5;
const newTransform = applyZoom(
  currentTransform,
  zoomFactor,
  mouseWorldPoint
);

// Result: zoomed in, mouse position stayed under cursor
```

### Pan by Dragging

```typescript
// User drags from (100, 100) to (150, 200)
const startScreen = { x: 100, y: 100 };
const endScreen = { x: 150, y: 200 };

// Delta in screen space
const screenDelta = {
  x: endScreen.x - startScreen.x,
  y: endScreen.y - startScreen.y,
};

// In world space, delta is same magnitude (no scaling)
const delta = screenDelta;

// Apply pan
const currentTransform = { offsetX: 0, offsetY: 0, zoom: 1 };
const newTransform = applyPan(currentTransform, delta);

// Result: canvas moved (50, 100) pixels in world space
```

## Key Invariants

1. **Screen space is unbounded** — user can drag cursor anywhere on screen
2. **World space is infinite** — zoom and pan can extend in any direction
3. **PDF space is fixed** — always 612×792 (or whatever source page dimensions are)
4. **Zoom is always positive** — `zoom > 0.1` (min zoom is 10%)
5. **Round-trip conversions are lossless** — screen → world → pdf → world → screen returns original (within floating-point tolerance)

## Floating-Point Precision

Coordinate conversions use floating-point math. Small rounding errors are expected and acceptable.

```typescript
// Test tolerance
const tolerance = 0.0001; // 0.01 pixels

function assertPointEqual(actual, expected) {
  const dx = Math.abs(actual.x - expected.x);
  const dy = Math.abs(actual.y - expected.y);
  if (dx > tolerance || dy > tolerance) {
    throw new Error(`Point mismatch`);
  }
}
```

All coordinate tests use `0.0001` tolerance.

## Common Mistakes

### ❌ Mistake 1: Inlining Coordinate Math

```typescript
// DON'T do this
const handleMouseMove = (e: MouseEvent) => {
  const worldX = (e.clientX - containerRect.left) * transform.zoom + transform.offsetX;
  const pdfX = (worldX - transform.offsetX) / transform.zoom;
  // ... rest of stroke logic
};
```

**Why:** Duplicated logic, easy to get wrong, hard to test, easy to forget pan offset.

### ✅ Solution: Use Pure Functions

```typescript
// DO this
const handleMouseMove = (e: MouseEvent) => {
  const screenPoint = { x: e.clientX, y: e.clientY };
  const worldPoint = screenToWorld(screenPoint, containerRect);
  const pdfPoint = worldToPdf(worldPoint, transform);
  // ... rest of stroke logic
};
```

### ❌ Mistake 2: Forgetting Container Offset

```typescript
// DON'T do this
const worldPoint = { x: e.clientX, y: e.clientY }; // Wrong! clientX is screen, not canvas-relative
```

**Why:** If the canvas element is not at (0, 0) on the page, this will be off.

### ✅ Solution: Convert Via Container Rect

```typescript
// DO this
const containerRect = canvasElement.getBoundingClientRect();
const worldPoint = screenToWorld({ x: e.clientX, y: e.clientY }, containerRect);
```

### ❌ Mistake 3: Wrong Order of Operations

```typescript
// DON'T zoom first, then convert
const worldPoint = { x: e.clientX / currentTransform.zoom, y: e.clientY / currentTransform.zoom };
// This is backwards!
```

**Why:** Event coordinates are in screen space, not world space. Convert screen → world first, then do zoom math.

### ✅ Solution: Follow the Chain

```typescript
// DO: screen → world → pdf
const worldPoint = screenToWorld(screenPoint, containerRect);
const pdfPoint = worldToPdf(worldPoint, transform);
```

## Testing Coordinates

Unit tests in `src/canvas/coordinates.test.ts` validate:

1. **Identity transforms** — no offset, 1x zoom, point unchanged
2. **Round-trip conversions** — screen → world → pdf → world → screen equals original
3. **Offset behavior** — pan offset correctly repositions points
4. **Zoom behavior** — zoom scales correctly and center-point stays fixed
5. **Zoom centering** — zooming at a point keeps that point under cursor

Run tests: `bun src/canvas/coordinates.test.ts`

All 12 tests should pass before any UI touches the coordinate system.

## Performance Considerations

- Conversions are cheap (just arithmetic, no DOM access)
- Safe to call on every mouse move or frame
- No caching needed; transforms are small objects

## Multiple Canvas Spaces (Surface 3)

**Superseded 2026-08-07 — see [Single Canvas Migration](./build-order.md#single-canvas-migration) in build-order.md.** Each linked Canvas is no longer a separate tldraw instance with its own transform; canvases are now a tag on shapes within one shared page-space store. Kept below as historical record.

Surface 3 (linked canvases, 2026-08-04) confirmed each canvas has its own transform, exactly as anticipated below — each linked Canvas is a fully independent tldraw instance (own pan/zoom, own persistenceKey `canvas-${canvasId}`).

What Surface 3 did **not** need, and what turned out to still be superseded by the Surface 2 approach: the functions in this file. PDF-side spillover (which of a page's linked canvases' PDF-side markup is currently visible) is implemented as tagged shapes living directly inside the *page's* own tldraw store — see [Architecture § Linked Canvases & Spillover](./architecture.md#linked-canvases--spillover-surface-3) — so page space and tldraw space stay identical by construction, the same way direct markup does. No `pdfToWorld`/`worldToPdf` calls were added.

```typescript
// Board transform
const boardTransform = { offsetX: 0, offsetY: 0, zoom: 1 };

// PDF page transform (usually no zoom on PDF pages in v1, but stays consistent)
const pageTransform = { offsetX: 0, offsetY: 0, zoom: 1 };

// Linked canvas transform (independent per canvas)
const canvasTransform = { offsetX: 50, offsetY: 75, zoom: 1.5 };

// Draw stroke at different positions depending on which surface is active
const pdfPoint = worldToPdf(mouseWorldPoint, pageTransform);
const canvasPoint = worldToPdf(mouseWorldPoint, canvasTransform);
```

No changes needed to coordinate functions; just keep separate transforms per surface.

## Cross-Layer Drawing: Resolving the Forward-Looking Note Above (2026-08-05)

**Superseded 2026-08-07 — see [Single Canvas Migration](./build-order.md#single-canvas-migration) in build-order.md.** `CrossLayerCapture.tsx` and `crossLayerDrawing.ts` (referenced throughout this section) have been deleted — there is no panel boundary left to capture a drag crossing. Kept below as historical record.

The note above anticipated cross-layer drawing would be the first feature to need a transform between a Canvas's world space and the Page's PDF space, via `pdfToWorld`/`worldToPdf`. It didn't, and deliberately wasn't extended to.

**What actually happens:** the capture overlay (`app/components/CrossLayerCapture.tsx`) buffers raw screen points for the duration of a drag, then hands them to `app/components/crossLayerDrawing.ts`, which converts each side's points with that side's own tldraw editor's `editor.screenToPage(point)` — not this module's `screenToWorld`/`worldToPdf`.

**Why not extend `coordinates.ts`:** this is the same call already made for the PDF page and for spillover (§ Multiple Canvas Spaces above) — once a surface is rendered by a real tldraw instance, tldraw's own camera *is* the Transform. `editor.screenToPage()` already reads that editor's tracked `screenBounds` and live `getCamera()` internally, correctly handling both sides of a cross-boundary drag with the same call:

- **PDF side:** the page panel's camera is locked (fixed fit-to-page, see [Architecture § Camera Lock](./architecture.md#surface-3-fix-pass-ii--shared-capsule-camera-lock-header-alignment-2026-08-05)), so `screenToPage()` there is a fixed, one-time transform — it can't have moved mid-drag.
- **Canvas side:** **revised 2026-08-05** — the linked canvas's camera is now also locked (see [Architecture § Camera Lock Extended](./architecture.md#fix-pass--camera-lock-extended-to-the-linked-canvas-panel-2026-08-05)), so `screenToPage()` there is equally a fixed transform. Previously the canvas camera was live (pan/zoom), which meant `screenToPage()` read whatever the camera happened to be at conversion time (pointer-up) — correct for a single drag, but it meant a *later* pan/zoom could move the canvas-side segment relative to the PDF-side one, since they'd been converted through different camera states at different times. With both cameras now permanently fixed, that can't happen: both segments are converted through cameras that never change again, for the life of the app.

Introducing a second, hand-rolled transform path (`pdfToWorld`/`worldToPdf`) alongside tldraw's own camera would mean two sources of truth for the same conversion — exactly the duplication § Common Mistakes above warns against. `coordinates.ts` remains reserved for conversions that happen *before* any tldraw instance exists for a surface (there are none yet in the shipped surfaces); it is not extended by this milestone.

The one piece of new, isolated, testable math this milestone did need — where to split a buffered point list at the panel boundary — lives in `splitPointsAtDivider()` in `crossLayerDrawing.ts`, not in `coordinates.ts`, since it operates purely in screen space (a vertical x-coordinate split) and has no pan/zoom/PDF-space dependency at all.
