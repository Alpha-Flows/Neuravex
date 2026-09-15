"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, subtitle, children, footer, className }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-bg-border bg-bg shadow-2xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-bg-border shrink-0">
          <div>
            <div className="text-sm font-semibold text-fg">{title}</div>
            {subtitle ? <div className="text-xs text-fg-muted mt-0.5">{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-card flex items-center justify-center text-sm shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bg-border shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
