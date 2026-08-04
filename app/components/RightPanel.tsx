"use client";

import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";

interface RightPanelProps {
  activeCanvasId: string | null;
  onEditorMount: (editor: Editor) => void;
}

// The active linked canvas's own tldraw instance. Each Canvas is a fully
// independent surface (own pan/zoom, own persistenceKey `canvas-${id}`);
// switching tabs just remounts the tldraw instance keyed by canvas id, which
// is a local operation — instant, no loading state (ui-interaction.md §5).
//
// Always mounts with hideUi: the shared Capsule (app/components/Capsule.tsx)
// is the only toolbar on screen — see PDFViewer.tsx's PageShell for how the
// active-editor tracking that routes Capsule actions here works.
export function RightPanel({ activeCanvasId, onEditorMount }: RightPanelProps) {
  if (!activeCanvasId) return null;

  return (
    <div className="w-full h-full">
      <Tldraw
        key={activeCanvasId}
        persistenceKey={`canvas-${activeCanvasId}`}
        onMount={onEditorMount}
        autoFocus
        hideUi
      />
    </div>
  );
}
