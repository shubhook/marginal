// Pure helper shared by every drag-to-reorder list in the app (Boards/PDFs
// in NotebookContents.tsx, Canvas tabs in PDFViewer.tsx) — moves the dragged
// item to sit at the target item's position, order-preserving otherwise.
// Persistence (reorderBoards/reorderPDFDocuments/reorderCanvases in
// src/storage/db.ts) is a separate concern; this only computes the new
// in-memory array for optimistic local state.
export function reorderList<T extends { id: string }>(
  list: T[],
  draggedId: string,
  targetId: string
): T[] {
  const dragIndex = list.findIndex((item) => item.id === draggedId);
  const targetIndex = list.findIndex((item) => item.id === targetId);
  if (dragIndex === -1 || targetIndex === -1 || dragIndex === targetIndex) return list;

  const next = [...list];
  const [dragged] = next.splice(dragIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}
