"use client";

import { ContainerProvider, EditorContext } from "@tldraw/editor";
import {
  DefaultStylePanel,
  DefaultToolbar,
  TldrawUiContextProvider,
  useRelevantStyles,
  type Editor,
} from "tldraw";
import { useState, type RefObject } from "react";

interface FloatingTldrawUiProps {
  activeEditorRef: RefObject<Editor | null>;
  version: number;
}

// Replaces an earlier hand-built minimal toolbar (select/pen/rectangle/
// text/eraser/undo/redo only). That approach silently dropped real tldraw
// functionality — no style panel (color/fill/dash/size), no hand tool,
// arrow, sticky note, image upload, or more-tools overflow — and rebuilding
// those individually isn't worth it when tldraw already ships them.
//
// Both underlying Tldraw instances (PDF panel, linked-canvas panel) mount
// with hideUi and never show their own chrome. This component renders
// tldraw's *real* DefaultToolbar and DefaultStylePanel once, floating over
// both panels, bound not to either instance's own editor but to whichever
// one `activeEditorRef` currently points at (PageShell re-points it via
// onPointerEnter — see PDFViewer.tsx). `version` forces this component to
// re-render when the ref's target changes, which re-supplies a new value to
// EditorContext.Provider below and every tldraw hook downstream (useEditor,
// useValue, etc.) picks that up through ordinary React context propagation
// — no signal-based tracking needed here, unlike the old Capsule's
// useValue(...) trick, because DefaultToolbar/DefaultStylePanel already do
// that internally against whatever editor the context hands them.
//
// This works standalone (outside a full <Tldraw> app) because
// DefaultToolbar/DefaultStylePanel read the editor via React context
// (useEditor()) — confirmed by reading tldraw's source: Tldraw.js is just
// TldrawEditor + TldrawUi, and TldrawUiContextProvider only calls
// useMaybeEditor(), tolerating an externally supplied EditorContext. Getting
// this actually working took three tldraw internals, not one:
//
// 1. EditorContext (which editor) — expected going in.
// 2. ContainerProvider (a DOM element for useContainer()) — discovered via a
//    runtime "useContainer used outside of <Tldraw />" error. Supplied by
//    wrapping in our own ref'd div.
// 3. Radix's dropdown/popover menus (e.g. the toolbar's "more tools"
//    overflow) portal into that *same* container element
//    (`DropdownMenu.Portal container={useContainer()}`, verified in
//    tldraw's source) rather than document.body — so `.tl-container`/
//    `.tl-theme__dark` (tldraw's CSS-custom-property scope for spacing and
//    color) has to live on that exact ref'd element, not on a child wrapper,
//    or portaled menu content renders unstyled/invisible. That element also
//    needs to be positioned (`absolute inset-0`) to sit over both panels —
//    but `.tl-container` itself sets `position: relative` in tldraw.css,
//    which loads after Tailwind's utilities in this app's bundle and wins
//    the cascade on a shared class list (equal specificity, later rule).
//    Fixed with an inline `style` for position, since inline styles always
//    win over stylesheet rules regardless of cascade order.
export function FloatingTldrawUi({ activeEditorRef, version }: FloatingTldrawUiProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void version; // re-render trigger only — read via the ref below, not this value
  const editor = activeEditorRef.current;
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setContainer}
      className="tl-container tl-theme__dark pointer-events-none"
      style={{ position: "absolute", inset: 0 }}
    >
      {container && editor && (
        <EditorContext.Provider value={editor}>
          <ContainerProvider container={container}>
            <TldrawUiContextProvider>
              <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]">
                <DefaultToolbar />
              </div>
              <StylePanel />
            </TldrawUiContextProvider>
          </ContainerProvider>
        </EditorContext.Provider>
      )}
    </div>
  );
}

// Split out so `useRelevantStyles()` (an editor-reading hook) only runs
// inside the EditorContext/TldrawUiContextProvider tree, not above it.
function StylePanel() {
  const styles = useRelevantStyles();
  return (
    <div className="pointer-events-auto absolute top-14 right-3 z-[500]">
      <DefaultStylePanel styles={styles} />
    </div>
  );
}
