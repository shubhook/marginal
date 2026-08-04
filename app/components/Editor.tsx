"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export function Editor() {
  return (
    <div className="w-full h-full">
      <Tldraw
        persistenceKey="marginal-editor"
        autoFocus
      />
    </div>
  );
}
