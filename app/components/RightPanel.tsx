"use client";

import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";

interface RightPanelProps {
  activeCanvasId: string | null;
  onEditorMount: (editor: Editor) => void;
}

// The active linked canvas's own tldraw instance. Each Canvas is a fully
// independent surface (own tldraw store, own persistenceKey `canvas-${id}`);
// switching tabs just remounts the tldraw instance keyed by canvas id, which
// is a local operation — instant, no loading state (ui-interaction.md §5).
//
// Camera lock: the linked-canvas panel is camera-locked the same way the PDF
// panel is (isLocked disables user-driven pan/wheel/pinch/keyboard zoom at
// the source) — this was revised from "free camera" once cross-layer
// drawing shipped: a pannable canvas-side camera let a cross-boundary
// stroke's two halves visually separate after the fact, which is no longer
// an accepted tradeoff now that a cleaner option (lock both sides) exists.
// Unlike the PDF panel, there's no `constraints` block here — a PDF page has
// fixed content dimensions to fit-and-letterbox against; a linked Canvas is
// meant to stay an unbounded surface, just one the user can no longer pan or
// zoom. Locking at a fixed (0, 0, 1) camera with no constraints means
// world-space and screen-space coincide 1:1 (same "camera IS the Transform,
// fixed" model the PDF panel and spillover already use), and tldraw's own
// resize handling — verified for the PDF panel — keeps this correct for
// free: `getConstrainedCamera` passes x/y through unchanged when no
// `constraints` are set, so a container resize just reveals more or less of
// the same fixed-origin canvas at the same fixed zoom, never distorting or
// needing a manual refit call. See architecture.md for the full rationale.
//
// Always mounts with hideUi: the shared floating toolbar (FloatingTldrawUi)
// is the only toolbar on screen — see PDFViewer.tsx's PageShell for how the
// active-editor tracking that routes toolbar actions here works.
export function RightPanel({ activeCanvasId, onEditorMount }: RightPanelProps) {
  if (!activeCanvasId) return null;

  const handleMount = (editor: Editor) => {
    editor.setCameraOptions({
      isLocked: true,
      wheelBehavior: "none",
    });
    // Force a canonical starting position — both to establish the fixed 1:1
    // frame described above, and to override any pan/zoom a canvas's tldraw
    // session state may have persisted from before this lock existed.
    editor.setCamera({ x: 0, y: 0, z: 1 }, { force: true });
    onEditorMount(editor);
  };

  return (
    <div className="w-full h-full">
      <Tldraw
        key={activeCanvasId}
        persistenceKey={`canvas-${activeCanvasId}`}
        onMount={handleMount}
        autoFocus
        hideUi
      />
    </div>
  );
}
