import { describe, expect, test } from "bun:test";
import type { Canvas } from "@/src/storage/types";
import {
  cameraToRestore,
  computeVisibilityUpdates,
  idsTaggedWithCanvas,
  tagShapeMeta,
  withSavedCamera,
} from "./canvasState";

function makeCanvas(overrides: Partial<Canvas> & { id: string }): Canvas {
  return {
    pageId: "pg_1",
    name: "Canvas",
    order: 1,
    isActive: false,
    lastCameraPosition: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("tagShapeMeta", () => {
  test("tags an untagged shape's meta with the active canvas", () => {
    expect(tagShapeMeta({}, "cv_a")).toEqual({ canvasId: "cv_a" });
  });

  test("tags a shape created while canvas A is active with A's id, and after switching to B with B's id", () => {
    expect(tagShapeMeta({}, "cv_a")).toEqual({ canvasId: "cv_a" });
    expect(tagShapeMeta({}, "cv_b")).toEqual({ canvasId: "cv_b" });
  });

  test("tags with null when no canvas is active", () => {
    expect(tagShapeMeta({}, null)).toEqual({ canvasId: null });
  });

  test("leaves a shape with an explicit canvasId alone (the background sentinel)", () => {
    expect(tagShapeMeta({ canvasId: null }, "cv_a")).toEqual({ canvasId: null });
  });

  test("leaves a shape with an explicit canvasId alone (a pasted/duplicated shape keeping its tag)", () => {
    expect(tagShapeMeta({ canvasId: "cv_original" }, "cv_a")).toEqual({ canvasId: "cv_original" });
  });

  test("preserves other meta keys untouched", () => {
    expect(tagShapeMeta({ foo: "bar" }, "cv_a")).toEqual({ foo: "bar", canvasId: "cv_a" });
  });

  test("handles undefined meta (a shape with no meta object at all)", () => {
    expect(tagShapeMeta(undefined, "cv_a")).toEqual({ canvasId: "cv_a" });
  });
});

describe("computeVisibilityUpdates", () => {
  test("shows only the active canvas's shapes and hides everything else", () => {
    const shapes = [
      { id: "s1", canvasId: "cv_a", opacity: 0, isLocked: true },
      { id: "s2", canvasId: "cv_b", opacity: 0, isLocked: true },
      { id: "s3", canvasId: "cv_a", opacity: 0, isLocked: true },
    ];

    const updates = computeVisibilityUpdates(shapes, "cv_a");

    expect(updates).toEqual(
      expect.arrayContaining([
        { id: "s1", opacity: 1, isLocked: false },
        { id: "s3", opacity: 1, isLocked: false },
      ])
    );
    expect(updates.find((u) => u.id === "s2")).toBeUndefined();
  });

  test("never touches the null-tagged background or untagged shapes", () => {
    const shapes = [
      { id: "bg", canvasId: null, opacity: 1, isLocked: true },
      { id: "untagged", canvasId: undefined, opacity: 1, isLocked: false },
      { id: "s1", canvasId: "cv_a", opacity: 0, isLocked: true },
    ];

    const updates = computeVisibilityUpdates(shapes, "cv_a");

    expect(updates.find((u) => u.id === "bg")).toBeUndefined();
    expect(updates.find((u) => u.id === "untagged")).toBeUndefined();
    expect(updates.find((u) => u.id === "s1")).toEqual({ id: "s1", opacity: 1, isLocked: false });
  });

  test("switching active canvas hides the previously-active shapes and shows the new one's", () => {
    const shapes = [
      { id: "s1", canvasId: "cv_a", opacity: 1, isLocked: false }, // currently visible (was active)
      { id: "s2", canvasId: "cv_b", opacity: 0, isLocked: true }, // currently hidden
    ];

    const updates = computeVisibilityUpdates(shapes, "cv_b");

    expect(updates).toEqual(
      expect.arrayContaining([
        { id: "s1", opacity: 0, isLocked: true },
        { id: "s2", opacity: 1, isLocked: false },
      ])
    );
  });

  test("skips shapes already in their correct visibility state (no redundant updates)", () => {
    const shapes = [
      { id: "s1", canvasId: "cv_a", opacity: 1, isLocked: false }, // already correct
      { id: "s2", canvasId: "cv_b", opacity: 0, isLocked: true }, // already correct
    ];

    expect(computeVisibilityUpdates(shapes, "cv_a")).toEqual([]);
  });

  test("hides every canvas-tagged shape when no canvas is active (activeCanvasId null)", () => {
    const shapes = [{ id: "s1", canvasId: "cv_a", opacity: 1, isLocked: false }];
    expect(computeVisibilityUpdates(shapes, null)).toEqual([
      { id: "s1", opacity: 0, isLocked: true },
    ]);
  });
});

describe("idsTaggedWithCanvas", () => {
  test("returns only the ids tagged with the given canvas", () => {
    const shapes = [
      { id: "s1", canvasId: "cv_a" },
      { id: "s2", canvasId: "cv_b" },
      { id: "s3", canvasId: "cv_a" },
      { id: "bg", canvasId: null },
    ];
    expect(idsTaggedWithCanvas(shapes, "cv_a")).toEqual(["s1", "s3"]);
  });

  test("returns an empty array when nothing matches", () => {
    expect(idsTaggedWithCanvas([{ id: "s1", canvasId: "cv_a" }], "cv_missing")).toEqual([]);
  });
});

describe("withSavedCamera", () => {
  test("sets lastCameraPosition on the matching canvas only", () => {
    const canvases = [makeCanvas({ id: "cv_a" }), makeCanvas({ id: "cv_b" })];
    const camera = { x: 10, y: 20, z: 1.5 };

    const result = withSavedCamera(canvases, "cv_a", camera);

    expect(result.find((c) => c.id === "cv_a")?.lastCameraPosition).toEqual(camera);
    expect(result.find((c) => c.id === "cv_b")?.lastCameraPosition).toBeNull();
  });

  test("is a no-op (returns an equivalent array) if the canvas id isn't found", () => {
    const canvases = [makeCanvas({ id: "cv_a" })];
    const result = withSavedCamera(canvases, "cv_missing", { x: 1, y: 2, z: 1 });
    expect(result).toEqual(canvases);
  });
});

describe("cameraToRestore", () => {
  test("returns the saved camera for a canvas that has one", () => {
    const camera = { x: 5, y: 5, z: 2 };
    const canvases = [makeCanvas({ id: "cv_a", lastCameraPosition: camera })];
    expect(cameraToRestore(canvases, "cv_a")).toEqual(camera);
  });

  test("first-visit case: a canvas with a null lastCameraPosition returns null (leave camera as-is, not a default/origin)", () => {
    const canvases = [makeCanvas({ id: "cv_a", lastCameraPosition: null })];
    expect(cameraToRestore(canvases, "cv_a")).toBeNull();
  });

  test("returns null when canvasId is null", () => {
    const canvases = [makeCanvas({ id: "cv_a", lastCameraPosition: { x: 1, y: 2, z: 1 } })];
    expect(cameraToRestore(canvases, null)).toBeNull();
  });

  test("returns null when the canvas isn't found", () => {
    const canvases = [makeCanvas({ id: "cv_a" })];
    expect(cameraToRestore(canvases, "cv_missing")).toBeNull();
  });
});
