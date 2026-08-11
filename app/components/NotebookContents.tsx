"use client";

import { useEffect, useRef, useState } from "react";
import type { Board, PDFDocument } from "@/src/storage/types";
import {
  createBoard,
  getBoardsByNotebook,
  updateBoard,
  softDeleteBoard,
  reorderBoards,
  getPDFsByNotebook,
  updatePDFDocument,
  softDeletePDFDocument,
  reorderPDFDocuments,
} from "@/src/storage/db";
import { reorderList } from "./dragReorder";
import { importPdfFile } from "@/src/pdf/importPdf";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

export type NotebookItemRef =
  | { type: "board"; id: string }
  | { type: "pdf"; id: string };

interface NotebookContentsProps {
  notebookId: string;
  onOpenItem: (item: NotebookItemRef) => void;
}

export function NotebookContents({ notebookId, onOpenItem }: NotebookContentsProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [editing, setEditing] = useState<NotebookItemRef | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NotebookItemRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadContents();
  }, [notebookId]);

  const loadContents = async () => {
    setIsLoading(true);
    try {
      const [loadedBoards, loadedPdfs] = await Promise.all([
        getBoardsByNotebook(notebookId),
        getPDFsByNotebook(notebookId),
      ]);
      setBoards(loadedBoards);
      setPdfs(loadedPdfs);
    } catch (error) {
      console.error("Failed to load notebook contents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBoard = async () => {
    try {
      const name = `Untitled Board — ${new Date().toLocaleDateString()}`;
      const board = await createBoard(notebookId, name);
      setBoards([...boards, board]);
      onOpenItem({ type: "board", id: board.id });
    } catch (error) {
      console.error("Failed to create board:", error);
    }
  };

  const handleImportPdf = async (file: File) => {
    setIsImporting(true);
    try {
      const doc = await importPdfFile(notebookId, file);
      setPdfs([...pdfs, doc]);
      onOpenItem({ type: "pdf", id: doc.id });
    } catch (error) {
      console.error("Failed to import PDF:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleStartEdit = (item: NotebookItemRef, currentName: string) => {
    setEditing(item);
    setEditingName(currentName);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const name = editingName.trim();
    if (name) {
      try {
        if (editing.type === "board") {
          await updateBoard(editing.id, { name });
          setBoards(boards.map((b) => (b.id === editing.id ? { ...b, name } : b)));
        } else {
          await updatePDFDocument(editing.id, { name });
          setPdfs(pdfs.map((p) => (p.id === editing.id ? { ...p, name } : p)));
        }
      } catch (error) {
        console.error("Failed to rename:", error);
      }
    }
    setEditing(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "board") {
        await softDeleteBoard(deleteTarget.id);
        setBoards(boards.filter((b) => b.id !== deleteTarget.id));
      } else {
        await softDeletePDFDocument(deleteTarget.id);
        setPdfs(pdfs.filter((p) => p.id !== deleteTarget.id));
      }
    } catch (error) {
      console.error("Failed to delete:", error);
    } finally {
      setDeleteTarget(null);
    }
  };

  const [draggedBoardId, setDraggedBoardId] = useState<string | null>(null);
  const [draggedPdfId, setDraggedPdfId] = useState<string | null>(null);

  const handleBoardDrop = async (targetId: string) => {
    const draggedId = draggedBoardId;
    setDraggedBoardId(null);
    if (!draggedId || draggedId === targetId) return;
    const reordered = reorderList(boards, draggedId, targetId);
    setBoards(reordered);
    try {
      await reorderBoards(reordered.map((b) => b.id));
    } catch (error) {
      console.error("Failed to persist board order:", error);
    }
  };

  const handlePdfDrop = async (targetId: string) => {
    const draggedId = draggedPdfId;
    setDraggedPdfId(null);
    if (!draggedId || draggedId === targetId) return;
    const reordered = reorderList(pdfs, draggedId, targetId);
    setPdfs(reordered);
    try {
      await reorderPDFDocuments(reordered.map((p) => p.id));
    } catch (error) {
      console.error("Failed to persist PDF order:", error);
    }
  };

  const isEmpty = boards.length === 0 && pdfs.length === 0;

  const renderCard = (
    item: NotebookItemRef,
    name: string,
    subtitle: string | null,
    drag: { onDragStart: () => void; onDrop: () => void }
  ) => {
    const isEditing = editing?.type === item.type && editing.id === item.id;
    if (isEditing) {
      return (
        <div className="flex gap-2 p-3 bg-[#1c1c1e] border border-[#2a2a2a] rounded">
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveEdit();
              else if (e.key === "Escape") setEditing(null);
            }}
            className="flex-1 px-2 py-1 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] outline-none"
            autoFocus
          />
          <button
            onClick={handleSaveEdit}
            className="text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
          >
            ✓
          </button>
        </div>
      );
    }
    return (
      <div
        className="group relative p-4 bg-[#1c1c1e] border border-[#2a2a2a] rounded cursor-pointer hover:bg-[#202020] transition-colors"
        onClick={() => onOpenItem(item)}
        draggable
        onDragStart={drag.onDragStart}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          drag.onDrop();
        }}
      >
        <p className="text-[#f0f0f0] text-xs truncate pr-10">{name}</p>
        {subtitle && (
          <p className="text-[#8a8a8a] text-[11px] mt-1 truncate">{subtitle}</p>
        )}
        <div className="hidden group-hover:flex gap-1 absolute top-2 right-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit(item, name);
            }}
            className="px-1.5 py-1 text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
            title="Rename"
          >
            ✎
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(item);
            }}
            className="px-1.5 py-1 text-[#8a8a8a] hover:text-red-500 text-xs"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportPdf(file);
          e.target.value = ""; // allow re-importing the same file
        }}
      />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[#f0f0f0] text-sm font-semibold">Contents</h2>
        <div className="flex gap-2">
          <button
            onClick={handleCreateBoard}
            className="px-3 py-2 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors"
          >
            + New Board
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-3 py-2 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {isImporting ? "Importing..." : "Import PDF"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[#8a8a8a] text-xs">Loading...</p>
      ) : isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#8a8a8a] text-sm mb-4">
              Nothing here yet — create a board or import a PDF
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleCreateBoard}
                className="px-4 py-2 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors"
              >
                + Create Board
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="px-4 py-2 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {isImporting ? "Importing..." : "Import PDF"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {boards.length > 0 && (
            <section>
              <h3 className="text-[#8a8a8a] text-[11px] uppercase tracking-wide mb-3">
                Boards
              </h3>
              <ul className="grid grid-cols-3 gap-3">
                {boards.map((board) => (
                  <li key={board.id}>
                    {renderCard({ type: "board", id: board.id }, board.name, null, {
                      onDragStart: () => setDraggedBoardId(board.id),
                      onDrop: () => handleBoardDrop(board.id),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {pdfs.length > 0 && (
            <section>
              <h3 className="text-[#8a8a8a] text-[11px] uppercase tracking-wide mb-3">
                PDFs
              </h3>
              <ul className="grid grid-cols-3 gap-3">
                {pdfs.map((pdf) => (
                  <li key={pdf.id}>
                    {renderCard({ type: "pdf", id: pdf.id }, pdf.name, pdf.fileName, {
                      onDragStart: () => setDraggedPdfId(pdf.id),
                      onDrop: () => handlePdfDrop(pdf.id),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <DeleteConfirmationDialog
        isOpen={deleteTarget !== null}
        title={deleteTarget?.type === "pdf" ? "Delete PDF" : "Delete Board"}
        message={
          deleteTarget?.type === "pdf"
            ? "Move this PDF to Trash? You can restore it later, or delete it permanently from Trash."
            : "Move this board to Trash? You can restore it later, or delete it permanently from Trash."
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel="Move to Trash"
      />
    </div>
  );
}
