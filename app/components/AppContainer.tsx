"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { BoardList } from "./BoardList";
import { Editor } from "./Editor";

export function AppContainer() {
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSelectNotebook = (notebookId: string | null) => {
    setActiveNotebookId(notebookId);
    setActiveBoardId(null); // switching notebooks always drops back to the board list
  };

  // Render placeholder on server to avoid hydration mismatch
  if (!isMounted) {
    return (
      <div className="flex w-full h-screen bg-black">
        <div className="w-64 bg-[#1c1c1e] border-r border-[#2a2a2a] h-screen" />
        <main className="flex-1 flex flex-col bg-[#121212]">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[#8a8a8a] text-sm mb-4">Loading...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen bg-black">
      <Sidebar
        activeNotebookId={activeNotebookId}
        onSelectNotebook={handleSelectNotebook}
      />
      <main className="flex-1 flex flex-col bg-[#121212]">
        {!activeNotebookId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[#8a8a8a] text-sm mb-4">
                Select or create a notebook to get started
              </p>
            </div>
          </div>
        ) : !activeBoardId ? (
          <BoardList notebookId={activeNotebookId} onOpenBoard={setActiveBoardId} />
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-2 border-b border-[#2a2a2a]">
              <button
                onClick={() => setActiveBoardId(null)}
                className="text-[#8a8a8a] hover:text-[#f0f0f0] text-xs"
              >
                ← Boards
              </button>
            </div>
            <div className="flex-1">
              <Editor boardId={activeBoardId} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
