import {
  Point,
  Transform,
  pdfToWorld,
  worldToPdf,
  screenToWorld,
  worldToScreen,
  applyZoom,
  applyPan,
  resetTransform,
} from "../../src/canvas/coordinates";

// Mock DOMRect for Node.js environment
class MockDOMRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.left = x;
    this.top = y;
    this.right = x + width;
    this.bottom = y + height;
  }

  toJSON() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      top: this.top,
      left: this.left,
      right: this.right,
      bottom: this.bottom,
    };
  }
}

function assertPointEqual(
  actual: Point,
  expected: Point,
  tolerance = 0.0001,
  message = ""
) {
  if (
    Math.abs(actual.x - expected.x) > tolerance ||
    Math.abs(actual.y - expected.y) > tolerance
  ) {
    throw new Error(
      `Point assertion failed ${message}\n` +
      `Expected: {x: ${expected.x}, y: ${expected.y}}\n` +
      `Actual:   {x: ${actual.x}, y: ${actual.y}}`
    );
  }
}

// Test suite
const tests = {
  "pdf-to-world identity": () => {
    const transform: Transform = { offsetX: 0, offsetY: 0, zoom: 1 };
    const point: Point = { x: 100, y: 200 };
    const result = pdfToWorld(point, transform);
    assertPointEqual(result, { x: 100, y: 200 }, 0.0001, "at 1:1 zoom");
  },

  "world-to-pdf round-trip": () => {
    const transform: Transform = { offsetX: 50, offsetY: 75, zoom: 2 };
    const originalPdf: Point = { x: 100, y: 200 };

    const worldPoint = pdfToWorld(originalPdf, transform);
    const backToPdf = worldToPdf(worldPoint, transform);

    assertPointEqual(backToPdf, originalPdf, 0.0001, "round-trip conversion");
  },

  "pdf-to-world with offset": () => {
    const transform: Transform = { offsetX: 100, offsetY: 200, zoom: 1 };
    const point: Point = { x: 50, y: 50 };
    const result = pdfToWorld(point, transform);
    assertPointEqual(result, { x: 150, y: 250 }, 0.0001, "with offset applied");
  },

  "pdf-to-world with zoom": () => {
    const transform: Transform = { offsetX: 0, offsetY: 0, zoom: 2 };
    const point: Point = { x: 100, y: 100 };
    const result = pdfToWorld(point, transform);
    assertPointEqual(result, { x: 200, y: 200 }, 0.0001, "with 2x zoom");
  },

  "pdf-to-world with zoom and offset": () => {
    const transform: Transform = { offsetX: 50, offsetY: 75, zoom: 2 };
    const point: Point = { x: 100, y: 100 };
    const result = pdfToWorld(point, transform);
    assertPointEqual(result, { x: 250, y: 275 }, 0.0001, "with zoom and offset");
  },

  "world-to-pdf at zoom": () => {
    const transform: Transform = { offsetX: 0, offsetY: 0, zoom: 2 };
    const worldPoint: Point = { x: 200, y: 200 };
    const result = worldToPdf(worldPoint, transform);
    assertPointEqual(result, { x: 100, y: 100 }, 0.0001, "at 2x zoom");
  },

  "screen-to-world conversion": () => {
    const screenPoint: Point = { x: 150, y: 250 };
    const containerRect = new MockDOMRect(50, 100, 800, 600) as any;
    const result = screenToWorld(screenPoint, containerRect);
    assertPointEqual(result, { x: 100, y: 150 }, 0.0001, "screen to world");
  },

  "world-to-screen conversion": () => {
    const worldPoint: Point = { x: 100, y: 150 };
    const containerRect = new MockDOMRect(50, 100, 800, 600) as any;
    const result = worldToScreen(worldPoint, containerRect);
    assertPointEqual(result, { x: 150, y: 250 }, 0.0001, "world to screen");
  },

  "screen-world-pdf round-trip": () => {
    const screenPoint: Point = { x: 200, y: 300 };
    const containerRect = new MockDOMRect(100, 50, 800, 600) as any;
    const transform: Transform = { offsetX: 25, offsetY: 50, zoom: 1.5 };

    // Screen -> World
    const worldPoint = screenToWorld(screenPoint, containerRect);
    // World -> PDF
    const pdfPoint = worldToPdf(worldPoint, transform);
    // PDF -> World
    const backToWorld = pdfToWorld(pdfPoint, transform);
    // World -> Screen
    const backToScreen = worldToScreen(backToWorld, containerRect);

    assertPointEqual(backToScreen, screenPoint, 0.0001, "screen-world-pdf round-trip");
  },

  "apply-zoom centered": () => {
    const transform: Transform = { offsetX: 0, offsetY: 0, zoom: 1 };
    const centerPoint: Point = { x: 100, y: 100 };

    // Zoom in by 2x centered at (100, 100)
    const zoomed = applyZoom(transform, 2, centerPoint);

    // The center point should remain at the same world coordinates
    const zoomedBackToPdf = worldToPdf(centerPoint, zoomed);
    const originalInPdf = worldToPdf(centerPoint, transform);

    assertPointEqual(zoomedBackToPdf, originalInPdf, 0.0001, "zoom center stays fixed");
  },

  "apply-pan": () => {
    const transform: Transform = { offsetX: 0, offsetY: 0, zoom: 1 };
    const delta: Point = { x: 50, y: 75 };

    const panned = applyPan(transform, delta);

    if (panned.offsetX !== 50 || panned.offsetY !== 75) {
      throw new Error(`Pan failed: expected {50, 75}, got {${panned.offsetX}, ${panned.offsetY}}`);
    }
  },

  "reset-transform": () => {
    const transform: Transform = { offsetX: 123, offsetY: 456, zoom: 5 };
    const reset = resetTransform();

    if (reset.offsetX !== 0 || reset.offsetY !== 0 || reset.zoom !== 1) {
      throw new Error(`Reset failed: expected {0, 0, 1}, got {${reset.offsetX}, ${reset.offsetY}, ${reset.zoom}}`);
    }
  },
};

// Run tests
let passed = 0;
let failed = 0;

for (const [testName, testFn] of Object.entries(tests)) {
  try {
    testFn();
    console.log(`✓ ${testName}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${testName}`);
    console.error(`  ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

console.log(
  `\n${passed} passed, ${failed} failed out of ${passed + failed} tests`
);

if (failed > 0) {
  process.exit(1);
}
