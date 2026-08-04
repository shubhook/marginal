"use client";

import { useState } from "react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import type { Canvas } from "@/src/storage/types";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";

interface RightPanelProps {
  canvases: Canvas[];
  activeCanvasId: string | null;
  onActivate: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAddTestSpillover: () => void;
  hideUi: boolean;
}

// Tab bar + the active canvas's own tldraw instance. Each Canvas is a fully
// independent surface (own pan/zoom, own persistenceKey `canvas-${id}`);
// switching tabs just remounts the tldraw instance keyed by canvas id, which
// is a local operation — instant, no loading state (ui-interaction.md §5).
export function RightPanel({
  canvases,
  activeCanvasId,
  onActivate,
  onCreate,
  onRename,
  onDelete,
  onClose,
  onAddTestSpillover,
  hideUi,
}: RightPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  const startEdit = (canvas: Canvas) => {
    setEditingId(canvas.id);
    setEditingName(canvas.name);
  };

  const saveEdit = (id: string) => {
    if (editingName.trim()) onRename(id, editingName.trim());
    setEditingId(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#1c1c1e]">
      <div className="flex items-center border-b border-[#2a2a2a] overflow-x-auto">
        {canvases.map((canvas) => {
          const isActive = canvas.id === activeCanvasId;
          return (
            <div
              key={canvas.id}
              className={`group relative shrink-0 border-b-2 ${
                isActive ? "border-[#f0f0f0]" : "border-transparent"
              }`}
            >
              {editingId === canvas.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(canvas.id);
                    else if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => saveEdit(canvas.id)}
                  className="w-24 px-2 py-2 bg-black text-[#f0f0f0] text-xs outline-none"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => onActivate(canvas.id)}
                  onDoubleClick={() => startEdit(canvas)}
                  className={`px-3 py-2 text-xs truncate max-w-[7rem] ${
                    isActive ? "text-[#f0f0f0]" : "text-[#8a8a8a] hover:text-[#f0f0f0]"
                  }`}
                  title={canvas.name}
                >
                  {canvas.name}
                </button>
              )}
              {canvases.length > 1 && editingId !== canvas.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmationId(canvas.id);
                  }}
                  className="hidden group-hover:block absolute top-0.5 right-0.5 text-[#8a8a8a] hover:text-red-500 text-[10px]"
                  title="Delete canvas"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={onCreate}
          className="shrink-0 px-3 py-2 text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
          title="New canvas"
        >
          +
        </button>
        <div className="flex-1" />
        <button
          onClick={onAddTestSpillover}
          className="shrink-0 px-2 py-2 text-[#8a8a8a] hover:text-[#f0f0f0] text-[10px]"
          title="Temporary test affordance (Surface 3 verification) — marks the page with this canvas's spillover. Real cross-layer drawing is next milestone."
        >
          ⊕ spill
        </button>
        <button
          onClick={onClose}
          className="shrink-0 px-2 py-2 text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
          title="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1">
        {activeCanvasId && (
          <Tldraw
            key={activeCanvasId}
            persistenceKey={`canvas-${activeCanvasId}`}
            autoFocus
            hideUi={hideUi}
          />
        )}
      </div>

      <DeleteConfirmationDialog
        isOpen={deleteConfirmationId !== null}
        title="Delete Canvas"
        message="Delete this linked canvas and its spillover on the page? This cannot be undone."
        onConfirm={() => {
          if (deleteConfirmationId) onDelete(deleteConfirmationId);
          setDeleteConfirmationId(null);
        }}
        onCancel={() => setDeleteConfirmationId(null)}
        isDangerous
      />
    </div>
  );
}
