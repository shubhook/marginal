"use client";

import { useEffect, useState } from "react";
import { Tldraw, type Editor as TldrawEditor } from "tldraw";
import "tldraw/tldraw.css";
import type { Board } from "@/src/storage/types";
import { getBoard } from "@/src/storage/db";
import { exportBoard } from "./export";
import { ExportMenu } from "./ExportMenu";

interface EditorProps {
  boardId: string;
}

export function Editor({ boardId }: EditorProps) {
  // Scope persistence to the board, not the notebook — a notebook can hold
  // multiple boards, each needing an independent canvas state.
  const persistenceKey = `board-${boardId}`;

  const [board, setBoard] = useState<Board | null>(null);
  const [editor, setEditor] = useState<TldrawEditor | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBoard(boardId)
      .then((loaded) => {
        if (!cancelled) setBoard(loaded ?? null);
      })
      .catch((error) => console.error("Failed to load board:", error));
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-end h-9 px-2 border-b border-[#2a2a2a] shrink-0">
        {editor && board && (
          <ExportMenu label="Export" onExport={(format) => exportBoard(editor, board, format)} />
        )}
      </div>
      <div className="flex-1 min-h-0">
        <Tldraw persistenceKey={persistenceKey} onMount={setEditor} autoFocus />
      </div>
    </div>
  );
}
