"use client";

import { useEffect, useState } from "react";
import type { Board, Notebook, PDFDocument } from "@/src/storage/types";
import {
  getTrashedItems,
  restoreNotebook,
  restoreBoard,
  restorePDFDocument,
  permanentlyDeleteNotebook,
  permanentlyDeleteBoard,
  permanentlyDeletePDFDocument,
} from "@/src/storage/db";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

type TrashItemRef =
  | { type: "notebook"; id: string }
  | { type: "board"; id: string }
  | { type: "pdf"; id: string };

// Trash view — lists every soft-deleted Notebook/Board/PDFDocument (see
// data-model.md § Trash) with per-item Restore / Permanently Delete actions.
// Flat, not nested under their (possibly also-trashed) parent — reuses the
// same list/sidebar visual patterns as NotebookContents.tsx rather than
// inventing new styling, per the task's explicit "doesn't need custom
// styling" scope.
export function TrashView() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [purgeTarget, setPurgeTarget] = useState<TrashItemRef | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const items = await getTrashedItems();
      setNotebooks(items.notebooks);
      setBoards(items.boards);
      setPdfs(items.pdfs);
    } catch (error) {
      console.error("Failed to load trash:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (item: TrashItemRef) => {
    try {
      if (item.type === "notebook") await restoreNotebook(item.id);
      else if (item.type === "board") await restoreBoard(item.id);
      else await restorePDFDocument(item.id);
      await load();
    } catch (error) {
      console.error("Failed to restore item:", error);
    }
  };

  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;
    try {
      if (purgeTarget.type === "notebook") await permanentlyDeleteNotebook(purgeTarget.id);
      else if (purgeTarget.type === "board") await permanentlyDeleteBoard(purgeTarget.id);
      else await permanentlyDeletePDFDocument(purgeTarget.id);
      await load();
    } catch (error) {
      console.error("Failed to permanently delete item:", error);
    } finally {
      setPurgeTarget(null);
    }
  };

  const isEmpty = notebooks.length === 0 && boards.length === 0 && pdfs.length === 0;

  const renderRow = (item: TrashItemRef, name: string, deletedAt: number | null) => (
    <li
      key={`${item.type}-${item.id}`}
      className="flex items-center justify-between px-3 py-2 bg-[#1c1c1e] border border-[#2a2a2a] rounded"
    >
      <div className="min-w-0">
        <p className="text-[#f0f0f0] text-xs truncate">{name}</p>
        <p className="text-[#8a8a8a] text-[11px] mt-0.5">
          Deleted {deletedAt ? new Date(deletedAt).toLocaleString() : "—"}
        </p>
      </div>
      <div className="flex gap-2 shrink-0 ml-3">
        <button
          onClick={() => handleRestore(item)}
          className="px-2 py-1 text-xs text-[#8a8a8a] hover:text-[#f0f0f0] border border-[#2a2a2a] rounded hover:bg-[#2a2a2a] transition-colors"
        >
          Restore
        </button>
        <button
          onClick={() => setPurgeTarget(item)}
          className="px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-900/50 rounded hover:bg-red-900/20 transition-colors"
        >
          Delete Forever
        </button>
      </div>
    </li>
  );

  const purgeLabel =
    purgeTarget?.type === "notebook"
      ? "notebook and everything in it"
      : purgeTarget?.type === "pdf"
        ? "PDF and all its pages and markup"
        : "board";

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-[#f0f0f0] text-sm font-semibold">Trash</h2>
        <p className="text-[#8a8a8a] text-[11px] mt-1">
          Items stay here until you restore or permanently delete them — nothing is auto-purged.
        </p>
      </div>

      {isLoading ? (
        <p className="text-[#8a8a8a] text-xs">Loading...</p>
      ) : isEmpty ? (
        <p className="text-[#8a8a8a] text-sm">Trash is empty</p>
      ) : (
        <div className="space-y-8">
          {notebooks.length > 0 && (
            <section>
              <h3 className="text-[#8a8a8a] text-[11px] uppercase tracking-wide mb-3">
                Notebooks
              </h3>
              <ul className="space-y-2">
                {notebooks.map((n) =>
                  renderRow({ type: "notebook", id: n.id }, n.name, n.deletedAt)
                )}
              </ul>
            </section>
          )}
          {boards.length > 0 && (
            <section>
              <h3 className="text-[#8a8a8a] text-[11px] uppercase tracking-wide mb-3">Boards</h3>
              <ul className="space-y-2">
                {boards.map((b) => renderRow({ type: "board", id: b.id }, b.name, b.deletedAt))}
              </ul>
            </section>
          )}
          {pdfs.length > 0 && (
            <section>
              <h3 className="text-[#8a8a8a] text-[11px] uppercase tracking-wide mb-3">PDFs</h3>
              <ul className="space-y-2">
                {pdfs.map((p) => renderRow({ type: "pdf", id: p.id }, p.name, p.deletedAt))}
              </ul>
            </section>
          )}
        </div>
      )}

      <DeleteConfirmationDialog
        isOpen={purgeTarget !== null}
        title="Delete Forever"
        message={`Permanently delete this ${purgeLabel}? This cannot be undone.`}
        onConfirm={handleConfirmPurge}
        onCancel={() => setPurgeTarget(null)}
        isDangerous
        confirmLabel="Delete Forever"
      />
    </div>
  );
}
