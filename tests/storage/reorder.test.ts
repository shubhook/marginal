// See tests/storage/db.test.ts for why fake-indexeddb/auto is imported both
// here and preloaded via bunfig.toml.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  createBoard,
  createCanvas,
  createNotebook,
  createPDFDocument,
  createPage,
  db,
  getBoardsByNotebook,
  getCanvasesByPage,
  getPDFsByNotebook,
  reorderBoards,
  reorderCanvases,
  reorderPDFDocuments,
} from "../../src/storage/db";

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("reorderBoards", () => {
  test("persists the given order and re-query returns boards in that order", async () => {
    const notebook = await createNotebook("Test Notebook");
    const a = await createBoard(notebook.id, "A");
    const b = await createBoard(notebook.id, "B");
    const c = await createBoard(notebook.id, "C");
    // Created in order A, B, C — now drag C to the front.
    expect((await getBoardsByNotebook(notebook.id)).map((x) => x.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);

    await reorderBoards([c.id, a.id, b.id]);

    const reordered = await getBoardsByNotebook(notebook.id);
    expect(reordered.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
    // Sequential order values reassigned, not just re-sorted by insertion.
    expect(reordered.map((x) => x.order)).toEqual([1, 2, 3]);
  });

  test("does not touch a sibling notebook's boards", async () => {
    const notebookA = await createNotebook("A");
    const notebookB = await createNotebook("B");
    const a1 = await createBoard(notebookA.id, "A1");
    const a2 = await createBoard(notebookA.id, "A2");
    const b1 = await createBoard(notebookB.id, "B1");

    await reorderBoards([a2.id, a1.id]);

    expect((await getBoardsByNotebook(notebookB.id)).map((x) => x.id)).toEqual([b1.id]);
  });
});

describe("reorderPDFDocuments", () => {
  test("persists the given order and re-query returns PDFs in that order", async () => {
    const notebook = await createNotebook("Test Notebook");
    const a = await createPDFDocument(notebook.id, "A", "a.pdf");
    const b = await createPDFDocument(notebook.id, "B", "b.pdf");
    const c = await createPDFDocument(notebook.id, "C", "c.pdf");
    expect((await getPDFsByNotebook(notebook.id)).map((x) => x.id)).toEqual([a.id, b.id, c.id]);

    await reorderPDFDocuments([b.id, c.id, a.id]);

    const reordered = await getPDFsByNotebook(notebook.id);
    expect(reordered.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
    expect(reordered.map((x) => x.order)).toEqual([1, 2, 3]);
  });
});

describe("reorderCanvases", () => {
  test("persists the given order and re-query returns canvas tabs in that order", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const page = await createPage(pdf.id, 0, 612, 792);
    const [canvas0] = await getCanvasesByPage(page.id); // auto-created
    const canvas1 = await createCanvas(page.id, "Canvas 1");
    const canvas2 = await createCanvas(page.id, "Canvas 2");
    expect((await getCanvasesByPage(page.id)).map((x) => x.id)).toEqual([
      canvas0.id,
      canvas1.id,
      canvas2.id,
    ]);

    await reorderCanvases([canvas2.id, canvas0.id, canvas1.id]);

    const reordered = await getCanvasesByPage(page.id);
    expect(reordered.map((x) => x.id)).toEqual([canvas2.id, canvas0.id, canvas1.id]);
    expect(reordered.map((x) => x.order)).toEqual([1, 2, 3]);
  });

  test("does not touch a sibling page's canvases", async () => {
    const notebook = await createNotebook("Test Notebook");
    const pdf = await createPDFDocument(notebook.id, "Test PDF", "test.pdf");
    const pageA = await createPage(pdf.id, 0, 612, 792);
    const pageB = await createPage(pdf.id, 1, 612, 792);
    const [canvasA0] = await getCanvasesByPage(pageA.id);
    const canvasA1 = await createCanvas(pageA.id, "Canvas 1");
    const [canvasB0] = await getCanvasesByPage(pageB.id);

    await reorderCanvases([canvasA1.id, canvasA0.id]);

    expect((await getCanvasesByPage(pageB.id)).map((x) => x.id)).toEqual([canvasB0.id]);
  });
});
