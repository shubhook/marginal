"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Editor } from "./Editor";

export function AppContainer() {
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);

  return (
    <div className="flex w-full h-screen bg-black">
      <Sidebar
        activeNotebookId={activeNotebookId}
        onSelectNotebook={setActiveNotebookId}
      />
      <main className="flex-1 flex flex-col bg-[#121212]">
        {activeNotebookId ? (
          <div className="flex-1">
            <Editor />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[#8a8a8a] text-sm mb-4">
                Select or create a notebook to get started
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
