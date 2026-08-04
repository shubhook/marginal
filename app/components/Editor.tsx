"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

interface EditorProps {
  boardId: string;
}

export function Editor({ boardId }: EditorProps) {
  // Scope persistence to the board, not the notebook — a notebook can hold
  // multiple boards, each needing an independent canvas state.
  const persistenceKey = `board-${boardId}`;

  return (
    <div className="w-full h-full">
      <Tldraw
        persistenceKey={persistenceKey}
        autoFocus
      />
    </div>
  );
}
