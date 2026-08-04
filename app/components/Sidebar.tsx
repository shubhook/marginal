"use client";

import { useEffect, useState } from "react";
import type { Notebook } from "@/src/storage/types";
import {
  createNotebook,
  getNotebooksList,
  updateNotebook,
  deleteNotebook,
} from "@/src/storage/db";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

interface SidebarProps {
  onSelectNotebook?: (notebookId: string) => void;
  activeNotebookId?: string | null;
}

export function Sidebar({ onSelectNotebook, activeNotebookId }: SidebarProps) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  // Load notebooks on mount
  useEffect(() => {
    loadNotebooks();
  }, []);

  const loadNotebooks = async () => {
    setIsLoading(true);
    try {
      const loaded = await getNotebooksList();
      setNotebooks(loaded);
    } catch (error) {
      console.error("Failed to load notebooks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNotebook = async () => {
    try {
      const name = `Notebook ${new Date().toLocaleDateString()}`;
      const notebook = await createNotebook(name);
      setNotebooks([...notebooks, notebook]);
      onSelectNotebook?.(notebook.id);
    } catch (error) {
      console.error("Failed to create notebook:", error);
    }
  };

  const handleStartEdit = (notebook: Notebook) => {
    setEditingId(notebook.id);
    setEditingName(notebook.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (editingName.trim()) {
      try {
        await updateNotebook(id, { name: editingName });
        setNotebooks(
          notebooks.map((nb) =>
            nb.id === id ? { ...nb, name: editingName } : nb
          )
        );
      } catch (error) {
        console.error("Failed to update notebook:", error);
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
      await deleteNotebook(deleteConfirmationId);
      setNotebooks(notebooks.filter((nb) => nb.id !== deleteConfirmationId));
      if (activeNotebookId === deleteConfirmationId) {
        onSelectNotebook?.(notebooks[0]?.id || null);
      }
    } catch (error) {
      console.error("Failed to delete notebook:", error);
    } finally {
      setDeleteConfirmationId(null);
    }
  };

  return (
    <div className="w-64 bg-[#1c1c1e] border-r border-[#2a2a2a] h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a]">
        <h1 className="text-[#f0f0f0] font-semibold text-sm mb-4">Notebooks</h1>
        <button
          onClick={handleCreateNotebook}
          className="w-full px-3 py-2 bg-black text-[#f0f0f0] text-xs rounded hover:bg-[#2a2a2a] transition-colors"
        >
          + New Notebook
        </button>
      </div>

      {/* Notebook list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-[#8a8a8a] text-xs">Loading...</div>
        ) : notebooks.length === 0 ? (
          <div className="p-4 text-[#8a8a8a] text-xs">No notebooks yet</div>
        ) : (
          <ul className="space-y-1 p-2">
            {notebooks.map((notebook) => (
              <li key={notebook.id}>
                {editingId === notebook.id ? (
                  <div className="flex gap-2 px-2 py-1">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveEdit(notebook.id);
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="flex-1 px-2 py-1 bg-black text-[#f0f0f0] text-xs rounded border border-[#2a2a2a] outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveEdit(notebook.id)}
                      className="px-2 py-1 bg-black text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <div
                    className={`px-3 py-2 rounded text-xs cursor-pointer group flex justify-between items-center ${
                      activeNotebookId === notebook.id
                        ? "bg-[#2a2a2a] text-[#f0f0f0]"
                        : "text-[#8a8a8a] hover:bg-[#252525] hover:text-[#f0f0f0]"
                    }`}
                    onClick={() => onSelectNotebook?.(notebook.id)}
                  >
                    <span className="flex-1 truncate">{notebook.name}</span>
                    <div className="hidden group-hover:flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(notebook);
                        }}
                        className="px-2 py-1 text-[#8a8a8a] hover:text-[#f0f0f0]"
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notebook.id);
                        }}
                        className="px-2 py-1 text-[#8a8a8a] hover:text-red-500"
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
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#2a2a2a] text-[#8a8a8a] text-xs">
        {notebooks.length} notebook{notebooks.length !== 1 ? "s" : ""}
      </div>

      <DeleteConfirmationDialog
        isOpen={deleteConfirmationId !== null}
        title="Delete Notebook"
        message="Delete this notebook? This cannot be undone."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmationId(null)}
        isDangerous
      />
    </div>
  );
}
