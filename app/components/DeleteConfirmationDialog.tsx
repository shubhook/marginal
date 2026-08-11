"use client";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
  // Defaults to "Delete" — pass e.g. "Move to Trash" or "Delete Forever" to
  // distinguish a soft-delete from a permanent one when reusing this same
  // dialog for both (see Trash view).
  confirmLabel?: string;
}

export function DeleteConfirmationDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isDangerous = false,
  confirmLabel = "Delete",
}: DeleteConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1c1c1e] border border-[#2a2a2a] rounded-lg p-6 max-w-sm shadow-lg">
        <h2 className="text-[#f0f0f0] text-sm font-semibold mb-2">{title}</h2>
        <p className="text-[#8a8a8a] text-sm mb-6">{message}</p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-[#f0f0f0] bg-black border border-[#2a2a2a] rounded hover:bg-[#2a2a2a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-medium rounded transition-colors ${
              isDangerous
                ? "bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50"
                : "bg-black text-[#f0f0f0] border border-[#2a2a2a] hover:bg-[#2a2a2a]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
