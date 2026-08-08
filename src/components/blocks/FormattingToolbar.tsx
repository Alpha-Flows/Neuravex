"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  /** Called when bold/italic/link is toggled. The caller re-reads innerHTML. */
  onFormat?: () => void;
}

/**
 * Floating formatting toolbar that appears above selected text
 * in contentEditable elements. Offers bold, italic, and link.
 */
export function FormattingToolbar({ onFormat }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onSelChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setVisible(false); return; }
      const range = sel.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      const editable =
        ancestor.nodeType === 1
          ? (ancestor as Element).closest?.("[contenteditable]") as Element | null
          : (ancestor as Node).parentElement?.closest?.("[contenteditable]") as Element | null;
      if (!editable) { setVisible(false); return; }
      if (!(editable.closest?.(".inline-editable") || (editable as Element).hasAttribute?.("contenteditable"))) { setVisible(false); return; }
      const rect = range.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top - 40 });
      setVisible(true);
    }
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    onFormat?.();
  }

  function insertLink() {
    const url = prompt("Link URL (e.g. https://)", "https://");
    if (url) exec("createLink", url);
  }

  if (!visible) return null;

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-bg-card border border-bg-border shadow-xl -translate-x-1/2"
    >
      <button onClick={() => exec("bold")} className="w-7 h-7 rounded hover:bg-bg-soft flex items-center justify-center text-sm font-bold text-fg-muted hover:text-fg" title="Bold (Ctrl+B)">B</button>
      <button onClick={() => exec("italic")} className="w-7 h-7 rounded hover:bg-bg-soft flex items-center justify-center text-sm italic text-fg-muted hover:text-fg" title="Italic (Ctrl+I)">I</button>
      <div className="w-px h-4 bg-bg-border" />
      <button onClick={insertLink} className="w-7 h-7 rounded hover:bg-bg-soft flex items-center justify-center text-xs text-fg-muted hover:text-fg underline" title="Link">🔗</button>
    </div>
  );
}
