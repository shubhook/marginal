"use client";

import { useEffect, useRef, useState } from "react";
import type { Board, Notebook, PDFDocument } from "@/src/storage/types";
import { searchAll, type SearchResults } from "@/src/storage/db";
import { isModKey } from "./keyboardShortcuts";
import type { NotebookItemRef } from "./NotebookContents";

interface SearchPaletteProps {
  onJumpToNotebook: (notebookId: string) => void;
  onJumpToItem: (notebookId: string, item: NotebookItemRef) => void;
}

const EMPTY_RESULTS: SearchResults = { notebooks: [], boards: [], pdfs: [] };
const DEBOUNCE_MS = 150;

// Cross-entity (Notebooks + Boards + PDFs) name search, bound to Cmd+K.
// Deliberately separate from Sidebar's collapsed-rail notebook switcher
// (notebook-only, mouse-driven) — this is the richer, keyboard-first
// jump-to-anything palette. See docs/ui-interaction.md § Search.
export function SearchPalette({ onJumpToNotebook, onJumpToItem }: SearchPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cmd+K — open the palette. Confirmed collision-free: tldraw only binds
  // plain `k` (frame tool); cmd+k is otherwise unused.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && isModKey(e) && !e.shiftKey && !e.altKey) {
        // Cmd+K is a global command-palette trigger — deliberately fires
        // even while typing elsewhere (e.g. renaming a notebook), same as
        // most apps' quick-open shortcuts.
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(EMPTY_RESULTS);
      // Let the palette mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      searchAll(query)
        .then(setResults)
        .catch((error) => console.error("Search failed:", error));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (!open) return null;

  const hasResults =
    results.notebooks.length > 0 || results.boards.length > 0 || results.pdfs.length > 0;

  const jumpToNotebook = (notebook: Notebook) => {
    onJumpToNotebook(notebook.id);
    setOpen(false);
  };
  const jumpToBoard = (board: Board) => {
    onJumpToItem(board.notebookId, { type: "board", id: board.id });
    setOpen(false);
  };
  const jumpToPdf = (pdf: PDFDocument) => {
    onJumpToItem(pdf.notebookId, { type: "pdf", id: pdf.id });
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/50">
      <div
        ref={containerRef}
        className="w-full max-w-md bg-[#1c1c1e] border border-[#2a2a2a] rounded-md shadow-lg overflow-hidden"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notebooks, boards, PDFs..."
          className="w-full px-4 py-3 bg-transparent text-[#f0f0f0] text-sm outline-none border-b border-[#2a2a2a]"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {query.trim() === "" ? (
            <div className="px-4 py-3 text-[#8a8a8a] text-xs">Type to search by name</div>
          ) : !hasResults ? (
            <div className="px-4 py-3 text-[#8a8a8a] text-xs">No matches</div>
          ) : (
            <>
              {results.notebooks.length > 0 && (
                <SearchGroup label="Notebooks">
                  {results.notebooks.map((n) => (
                    <SearchResultRow key={n.id} onClick={() => jumpToNotebook(n)}>
                      {n.name}
                    </SearchResultRow>
                  ))}
                </SearchGroup>
              )}
              {results.boards.length > 0 && (
                <SearchGroup label="Boards">
                  {results.boards.map((b) => (
                    <SearchResultRow key={b.id} onClick={() => jumpToBoard(b)}>
                      {b.name}
                    </SearchResultRow>
                  ))}
                </SearchGroup>
              )}
              {results.pdfs.length > 0 && (
                <SearchGroup label="PDFs">
                  {results.pdfs.map((p) => (
                    <SearchResultRow key={p.id} onClick={() => jumpToPdf(p)}>
                      {p.name}
                    </SearchResultRow>
                  ))}
                </SearchGroup>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 pt-2 pb-1 text-[#8a8a8a] text-[11px] uppercase tracking-wide">
        {label}
      </div>
      {children}
    </div>
  );
}

function SearchResultRow({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2 text-xs text-[#8a8a8a] hover:bg-[#252525] hover:text-[#f0f0f0] truncate"
    >
      {children}
    </button>
  );
}
