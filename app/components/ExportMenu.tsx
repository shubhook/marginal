"use client";

import { useEffect, useRef, useState } from "react";
import type { ExportImageFormat } from "./export";

interface ExportMenuProps {
  label: string;
  onExport: (format: ExportImageFormat) => void | Promise<void>;
}

// Small reusable button+popover for choosing an export format — modeled on
// Sidebar's switcher popover (absolute-positioned div, closes on outside
// click/Escape). Used for both Board and Page export.
export function ExportMenu({ label, onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handlePick = async (format: ExportImageFormat) => {
    setOpen(false);
    setIsExporting(true);
    try {
      await onExport(format);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isExporting}
        className="px-2 py-1 text-xs text-[#8a8a8a] hover:text-[#f0f0f0] disabled:opacity-40 disabled:pointer-events-none"
      >
        {isExporting ? "Exporting..." : label}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-[9999] w-28 bg-[#1c1c1e] border border-[#2a2a2a] rounded-md shadow-md py-1">
          <button
            onClick={() => handlePick("png")}
            className="w-full text-left px-3 py-1.5 text-xs text-[#8a8a8a] hover:bg-[#252525] hover:text-[#f0f0f0]"
          >
            PNG
          </button>
          <button
            onClick={() => handlePick("svg")}
            className="w-full text-left px-3 py-1.5 text-xs text-[#8a8a8a] hover:bg-[#252525] hover:text-[#f0f0f0]"
          >
            SVG
          </button>
        </div>
      )}
    </div>
  );
}
