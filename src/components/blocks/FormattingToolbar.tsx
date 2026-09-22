"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isSafeHref } from "@/lib/url-safety";
import { Overlay } from "@/components/ui/Overlay";

interface Props {
  /** Called when bold/italic/link is toggled. The caller re-reads innerHTML. */
  onFormat?: () => void;
}

/**
 * Floating formatting toolbar that appears above selected text
 * in contentEditable elements. Offers bold, italic, and link.
 *
 * Only the element being edited renders one of these. Every editable used to
 * render its own, all of them shown at once and stacked on the same spot, so
 * a click landed on whichever happened to be on top.
 */
export function FormattingToolbar({ onFormat }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("https://");
  const ref = useRef<HTMLDivElement>(null);
  // The text that was selected when the link button was pressed. Focus moves
  // to the input below, and the browser drops the selection when it does.
  const savedRange = useRef<Range | null>(null);
  // Read by the `selectionchange` listener, which is installed once and so
  // closes over the first `linking`. Kept in step here rather than assigned
  // during render: a render can be thrown away and re-run, and writing a ref
  // on the way through is not safe under concurrent rendering.
  const linkingRef = useRef(false);
  useEffect(() => {
    linkingRef.current = linking;
  }, [linking]);
  // The toolbar is centred on the selection, and the link field makes it much
  // wider than the three buttons. Near the edge of the window that put half of
  // it off-canvas, over the block palette.
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    function onSelChange() {
      // While a link is being typed the selection lives in the input, not in
      // the text — keep the toolbar up rather than yanking it away mid-edit.
      if (linkingRef.current) return;
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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const half = el.offsetWidth / 2;
    const margin = 8;
    const clamped = Math.min(Math.max(pos.x, half + margin), window.innerWidth - half - margin);
    setLeft((prev) => (prev === clamped ? prev : clamped));
  }, [pos.x, linking, visible]);

  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    onFormat?.();
  }

  function startLinking() {
    const sel = window.getSelection();
    savedRange.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    setUrl("https://");
    setLinking(true);
  }

  function applyLink() {
    // `createLink` writes whatever it is handed into an href. A `javascript:`
    // or `data:` URL typed in here was stored, published, and copied into the
    // customer's download, where there is no CSP to refuse it.
    const href = isSafeHref(url.trim());
    setLinking(false);
    if (!href || href === "https://") return;
    // Put the selection back before asking the browser to wrap it.
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
    exec("createLink", href);
  }

  if (!visible) return null;

  // Buttons must not take focus: the browser clears the selection when focus
  // leaves the text, and execCommand would then have nothing to act on.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    // Drawn on the body. Inside a block it would be held in that block's
    // layer, and a toolbar for a block sent behind its neighbours would be
    // behind them too.
    <Overlay>
      <div
        ref={ref}
        data-formatting-toolbar
        style={{ left: left ?? pos.x, top: pos.y }}
        className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-bg-card border border-bg-border shadow-xl -translate-x-1/2"
        onClick={(e) => e.stopPropagation()}
      >
        {linking ? (
          <>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); applyLink(); }
                if (e.key === "Escape") { e.preventDefault(); setLinking(false); }
              }}
              placeholder="https://example.com"
              aria-label="Link URL"
              className="h-7 w-56 px-2 rounded-md bg-bg border border-bg-border text-fg text-xs placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            <button onMouseDown={keepFocus} onClick={applyLink} className="h-7 px-2 rounded-md text-xs font-medium bg-brand text-white hover:opacity-90">Link</button>
            <button onMouseDown={keepFocus} onClick={() => setLinking(false)} className="h-7 px-2 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-soft">Cancel</button>
          </>
        ) : (
          <>
            <button onMouseDown={keepFocus} onClick={() => exec("bold")} className="w-7 h-7 rounded hover:bg-bg-soft flex items-center justify-center text-sm font-bold text-fg-muted hover:text-fg" title="Bold (Ctrl+B)">B</button>
            <button onMouseDown={keepFocus} onClick={() => exec("italic")} className="w-7 h-7 rounded hover:bg-bg-soft flex items-center justify-center text-sm italic text-fg-muted hover:text-fg" title="Italic (Ctrl+I)">I</button>
            <div className="w-px h-4 bg-bg-border" />
            <button onMouseDown={keepFocus} onClick={startLinking} className="w-7 h-7 rounded hover:bg-bg-soft flex items-center justify-center text-xs text-fg-muted hover:text-fg underline" title="Link">🔗</button>
          </>
        )}
      </div>
    </Overlay>
  );
}
