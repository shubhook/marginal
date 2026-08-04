"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

interface EditorProps {
  notebookId?: string | null;
}

export function Editor({ notebookId }: EditorProps) {
  // Use notebook ID in persistence key so each notebook has its own canvas state
  const persistenceKey = notebookId ? `notebook-${notebookId}` : "marginal-editor-default";

  return (
    <div className="w-full h-full">
      <Tldraw
        persistenceKey={persistenceKey}
        autoFocus
      />
    </div>
  );
}
