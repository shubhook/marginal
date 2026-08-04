"use client";

import { useEffect, useState } from "react";
import type { Board } from "@/src/storage/types";
import {
  createBoard,
  getBoardsByNotebook,
  updateBoard,
  deleteBoard,
} from "@/src/storage/db";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

interface BoardListProps {
  notebookId: string;
  onOpenBoard: (boardId: string) => void;
}

export function BoardList({ notebookId, onOpenBoard }: BoardListProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  useEffect(() => {
    loadBoards();
  }, [notebookId]);

  const loadBoards = async () => {
    setIsLoading(true);
    try {
      const loaded = await getBoardsByNotebook(notebookId);
      setBoards(loaded);
    } catch (error) {
      console.error("Failed to load boards:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBoard = async () => {
    try {
      const name = `Untitled Board — ${new Date().toLocaleDateString()}`;
      const board = await createBoard(notebookId, name);
      setBoards([...boards, board]);
      onOpenBoard(board.id);
    } catch (error) {
      console.error("Failed to create board:", error);
    }
  };

  const handleStartEdit = (board: Board) => {
    setEditingId(board.id);
    setEditingName(board.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (editingName.trim()) {
      try {
        await updateBoard(id, { name: editingName });
        setBoards(boards.map((b) => (b.id === id ? { ...b, name: editingName } : b)));
      } catch (error) {
        console.error("Failed to update board:", error);
      }
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmationId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmationId) return;

    try {
      await deleteBoard(deleteConfirmationId);
      setBoards(boards.filter((b) => b.id !== deleteConfirmationId));
    } catch (error) {
      console.error("Failed to delete board:", error);
    } finally {
      setDeleteConfirmationId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[#f0f0f0] text-sm font-semibold">Boards</h2>
        <button
          onClick={handleCreateBoard}
          className="px-3 py-2 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors"
        >
          + New Board
        </button>
      </div>

      {isLoading ? (
        <p className="text-[#8a8a8a] text-xs">Loading...</p>
      ) : boards.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#8a8a8a] text-sm mb-4">
              No boards yet — create one to start drawing
            </p>
            <button
              onClick={handleCreateBoard}
              className="px-4 py-2 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors"
            >
              + Create Board
            </button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3">
          {boards.map((board) => (
            <li key={board.id}>
              {editingId === board.id ? (
                <div className="flex gap-2 p-3 bg-[#1c1c1e] border border-[#2a2a2a] rounded">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(board.id);
                      else if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 px-2 py-1 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveEdit(board.id)}
                    className="text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <div
                  className="group relative p-4 bg-[#1c1c1e] border border-[#2a2a2a] rounded cursor-pointer hover:bg-[#202020] transition-colors"
                  onClick={() => onOpenBoard(board.id)}
                >
                  <p className="text-[#f0f0f0] text-xs truncate pr-10">{board.name}</p>
                  <div className="hidden group-hover:flex gap-1 absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(board);
                      }}
                      className="px-1.5 py-1 text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(board.id);
                      }}
                      className="px-1.5 py-1 text-[#8a8a8a] hover:text-red-500 text-xs"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <DeleteConfirmationDialog
        isOpen={deleteConfirmationId !== null}
        title="Delete Board"
        message="Delete this board? This cannot be undone."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmationId(null)}
        isDangerous
      />
    </div>
  );
}
