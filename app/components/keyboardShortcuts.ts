// Shared guard for app-level (non-tldraw) keyboard shortcuts — mirrors
// tldraw's own `shouldSkipEvent` (see node_modules/tldraw's
// useKeyboardShortcuts.ts) so our shortcuts don't fire while the user is
// typing into a text field (renaming a notebook/board/canvas, editing a
// search query, etc).
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const input = target as HTMLInputElement;
    const nonTextTypes = ["checkbox", "radio", "range", "button", "file", "reset", "submit", "color"];
    return !nonTextTypes.includes(input.type);
  }
  return false;
}

// True for Cmd on Mac / Ctrl elsewhere — matches how tldraw treats
// accelerator keys (isAccelKey in @tldraw/editor).
export function isModKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}
