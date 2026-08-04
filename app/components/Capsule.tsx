"use client";

import { useValue } from "@tldraw/state-react";
import type { Editor } from "tldraw";
import type { RefObject } from "react";

interface CapsuleProps {
  activeEditorRef: RefObject<Editor | null>;
  version: number;
}

interface CapsuleTool {
  id: string;
  toolId: string;
  label: string;
  icon: string;
}

// select/pen/rectangle/text/eraser, per STYLING.md §5's tool list, plus
// undo/redo. Minimal styling here on purpose — full STYLING.md §5 treatment
// (final icon set, exact spacing) is a Polish-phase task. What's pulled
// forward is the architecture: a toolbar that belongs to neither tldraw
// instance and routes to whichever one is active.
const TOOLS: CapsuleTool[] = [
  { id: "select", toolId: "select", label: "Select", icon: "↖" },
  { id: "draw", toolId: "draw", label: "Pen", icon: "✎" },
  { id: "geo", toolId: "geo", label: "Rectangle", icon: "▭" },
  { id: "text", toolId: "text", label: "Text", icon: "T" },
  { id: "eraser", toolId: "eraser", label: "Eraser", icon: "⌫" },
];

// Rendered once, shared across whichever panel (PDF page or linked canvas)
// currently has the pointer. Never owned by either tldraw instance — both
// mount with hideUi, so this is the only toolbar on screen. Every action
// reads `activeEditorRef.current` at click time rather than closing over a
// specific editor, so it always targets whichever panel the cursor last
// entered (see PDFViewer.tsx's PageShell for how the ref is kept current).
export function Capsule({ activeEditorRef, version }: CapsuleProps) {
  const currentToolId = useValue(
    "capsule-current-tool",
    () => activeEditorRef.current?.getCurrentToolId() ?? null,
    [activeEditorRef, version]
  );

  const canUndo = useValue(
    "capsule-can-undo",
    () => activeEditorRef.current?.getCanUndo() ?? false,
    [activeEditorRef, version]
  );
  const canRedo = useValue(
    "capsule-can-redo",
    () => activeEditorRef.current?.getCanRedo() ?? false,
    [activeEditorRef, version]
  );

  const withActiveEditor = (fn: (editor: Editor) => void) => {
    const editor = activeEditorRef.current;
    if (editor) fn(editor);
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-full border border-[#2a2a2a] bg-[#1c1c1e] shadow-md">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => withActiveEditor((editor) => editor.setCurrentTool(tool.toolId))}
          title={tool.label}
          className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
            currentToolId === tool.toolId
              ? "bg-[#2a2a2a] text-[#f0f0f0]"
              : "text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#242424]"
          }`}
        >
          {tool.icon}
        </button>
      ))}
      <div className="w-px h-5 bg-[#2a2a2a] mx-1" />
      <button
        onClick={() => withActiveEditor((editor) => editor.undo())}
        disabled={!canUndo}
        title="Undo"
        className="w-8 h-8 flex items-center justify-center rounded-full text-sm text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#242424] disabled:opacity-30 disabled:pointer-events-none"
      >
        ↺
      </button>
      <button
        onClick={() => withActiveEditor((editor) => editor.redo())}
        disabled={!canRedo}
        title="Redo"
        className="w-8 h-8 flex items-center justify-center rounded-full text-sm text-[#8a8a8a] hover:text-[#f0f0f0] hover:bg-[#242424] disabled:opacity-30 disabled:pointer-events-none"
      >
        ↻
      </button>
    </div>
  );
}
