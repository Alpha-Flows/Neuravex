"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** What is being edited, shown above the field. */
  label: string;
  value: string;
  onSave: (next: string) => void;
  onCancel: () => void;
  placeholder?: string;
  /** A line of guidance under the field — examples of a valid value, say. */
  hint?: string;
  className?: string;
}

/**
 * A small editing panel anchored to the control that opened it.
 *
 * It replaces `prompt()`, which could not be styled, blocked the whole
 * window, showed no context beyond one line of text, and — worst of it — took
 * the text selection with it, so a link typed into one was applied to
 * nothing. This keeps the page behind it visible and live.
 *
 * Enter saves, Escape cancels, and clicking outside cancels. The value is
 * only handed back when it is deliberately saved.
 */
export function InlineEdit({ label, value, onSave, onCancel, placeholder, hint, className }: Props) {
  const [draft, setDraft] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) onCancel();
    }
    // A capture-phase listener: the canvas below stops propagation of its own
    // clicks, so a bubbling listener would never hear about them.
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [onCancel]);

  return (
    <div
      ref={boxRef}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute z-30 mt-1 w-72 rounded-lg border border-bg-border bg-bg-card p-3 text-left shadow-xl",
        className,
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-fg-muted font-medium mb-1.5">{label}</div>
      <input
        ref={inputRef}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); onSave(draft); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        className="h-8 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand/40"
      />
      {hint ? <div className="text-[11px] text-fg-subtle mt-1.5">{hint}</div> : null}
      <div className="flex items-center justify-end gap-1.5 mt-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 px-2.5 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-soft"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="h-7 px-3 rounded-md text-xs font-medium bg-brand text-white hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}
