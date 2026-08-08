"use client";

import { useEffect, useRef, useState } from "react";
import type { Notebook } from "@/src/storage/types";
import {
  createNotebook,
  getNotebooksList,
  updateNotebook,
  deleteNotebook,
} from "@/src/storage/db";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { isModKey, isTypingTarget } from "./keyboardShortcuts";

interface SidebarProps {
  onSelectNotebook?: (notebookId: string | null) => void;
  activeNotebookId?: string | null;
}

// Pure UI preference, not app data — same pattern as the split-pane width
// (docs/ui-interaction.md § Bounded Panel & Resizable Split).
const SIDEBAR_COLLAPSED_STORAGE_KEY = "marginal:sidebarCollapsed";

export function Sidebar({ onSelectNotebook, activeNotebookId }: SidebarProps) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Load notebooks on mount
  useEffect(() => {
    loadNotebooks();
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (!switcherOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwitcherOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [switcherOpen]);

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

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  // Cmd+B — toggle sidebar collapse. Confirmed collision-free: tldraw only
  // binds plain `b` (draw tool) and `cmd+b` is otherwise unused — see
  // docs/ui-interaction.md § Keyboard Shortcuts.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!isModKey(e) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      const updatedNotebooks = notebooks.filter((nb) => nb.id !== deleteConfirmationId);
      setNotebooks(updatedNotebooks);

      // If deleted notebook was active, select next one (or none if list is empty)
      if (activeNotebookId === deleteConfirmationId) {
        onSelectNotebook?.(updatedNotebooks[0]?.id || null);
      }
    } catch (error) {
      console.error("Failed to delete notebook:", error);
    } finally {
      setDeleteConfirmationId(null);
    }
  };

  const handleSwitchTo = (id: string) => {
    onSelectNotebook?.(id);
    setSwitcherOpen(false);
  };

  const switcherPopover = switcherOpen && (
    <div
      ref={switcherRef}
      className="fixed top-16 left-4 z-50 w-56 max-h-80 overflow-y-auto bg-[#1c1c1e] border border-[#2a2a2a] rounded-md shadow-md py-1"
    >
      <div className="px-3 py-1.5 text-[#8a8a8a] text-[11px] uppercase tracking-wide">
        Switch notebook
      </div>
      {notebooks.length === 0 ? (
        <div className="px-3 py-2 text-[#8a8a8a] text-xs">No notebooks yet</div>
      ) : (
        notebooks.map((notebook) => (
          <button
            key={notebook.id}
            onClick={() => handleSwitchTo(notebook.id)}
            className={`w-full text-left px-3 py-2 text-xs truncate ${
              activeNotebookId === notebook.id
                ? "bg-[#2a2a2a] text-[#f0f0f0]"
                : "text-[#8a8a8a] hover:bg-[#252525] hover:text-[#f0f0f0]"
            }`}
          >
            {notebook.name}
          </button>
        ))
      )}
    </div>
  );

  // Collapsed: icon-only rail. Tablet/laptop rationale (also noted in
  // ui-interaction.md): with two panels already on screen in Surface 3, an
  // always-expanded 256px sidebar competes directly with that horizontal
  // space, so collapsing it to a rail (new-notebook + switcher) is a real
  // usability need, not just a nice-to-have.
  if (collapsed) {
    return (
      <>
        <div className="w-12 bg-[#1c1c1e] border-r border-[#2a2a2a] h-screen flex flex-col items-center py-3 gap-2 shrink-0">
          <button
            onClick={toggleCollapsed}
            title="Expand sidebar"
            className="w-8 h-8 flex items-center justify-center rounded text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#252525] text-xs"
          >
            »
          </button>
          <button
            onClick={handleCreateNotebook}
            title="New notebook"
            className="w-8 h-8 flex items-center justify-center rounded text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#252525] text-base"
          >
            +
          </button>
          <button
            onClick={() => setSwitcherOpen((o) => !o)}
            title="Switch notebook"
            className={`w-8 h-8 flex items-center justify-center rounded text-xs ${
              switcherOpen
                ? "bg-[#2a2a2a] text-[#f0f0f0]"
                : "text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#252525]"
            }`}
          >
            ☰
          </button>
        </div>
        {switcherPopover}
      </>
    );
  }

  return (
    <div className="w-64 bg-[#1c1c1e] border-r border-[#2a2a2a] h-screen flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[#f0f0f0] font-semibold text-sm">Notebooks</h1>
          <button
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            className="w-6 h-6 flex items-center justify-center rounded text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#252525] text-xs"
          >
            «
          </button>
        </div>
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
