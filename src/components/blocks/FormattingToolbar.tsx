"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isSafeHref } from "@/lib/url-safety";
import { Overlay } from "@/components/ui/Overlay";
import { SiteSwatches } from "@/components/editor/site-colors";

interface Props {
  /** Called when the text's formatting changes. The caller re-reads innerHTML. */
  onFormat?: () => void;
}

/** Colours offered for text beside the site's own: dark, grey, and a few that read on white. */
const TEXT_COLOURS = ["#0f172a", "#64748b", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#7c3aed", "#ffffff"];
/** Light enough that dark text stays readable on them. */
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e2e8f0"];

/**
 * What the browser is asked to paint, to be swapped for the colour meant.
 *
 * The browser's own colour commands are the ones that know how to colour part
 * of a word inside a bold inside a link, splitting what has to be split — but
 * they take only a colour they can parse, and a palette colour is a reference
 * to the site's slot (`var(--site-color-2, …)`), which they refuse. So they
 * are handed a colour nobody picks, and every element they painted with it is
 * found afterwards and given the real one.
 */
const MARKER = { color: "rgb(1, 2, 3)", backgroundColor: "rgb(1, 2, 4)" } as const;

/**
 * Colour the selected text, or take its colour away when `value` is null.
 *
 * Taking it away is the same command followed by removing the marker rather
 * than replacing it: the command has already taken every other colour off the
 * selected text to put its own on.
 */
function paint(prop: "color" | "backgroundColor", value: string | null) {
  const sel = window.getSelection();
  const anchor = sel?.anchorNode;
  const root = (anchor?.nodeType === 1 ? (anchor as Element) : anchor?.parentElement)?.closest("[contenteditable]");
  if (!root) return;
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand(prop === "color" ? "foreColor" : "hiliteColor", false, prop === "color" ? "#010203" : "#010204");
  document.execCommand("styleWithCSS", false, "false");
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style]"))) {
    if (el.style[prop] !== MARKER[prop]) continue;
    if (value) el.style.setProperty(prop === "color" ? "color" : "background-color", value);
    else el.style.removeProperty(prop === "color" ? "color" : "background-color");
    // A span left with nothing to say is only in the way of the next edit.
    if (el.tagName === "SPAN" && !el.getAttribute("style")?.trim() && el.attributes.length <= 1) el.replaceWith(...Array.from(el.childNodes));
  }
}

/**
 * Floating formatting toolbar that appears above selected text
 * in contentEditable elements: bold, italic, underline, strikethrough, a
 * colour, a highlight, clearing all of that, and a link.
 *
 * Only the element being edited renders one of these. Every editable used to
 * render its own, all of them shown at once and stacked on the same spot, so
 * a click landed on whichever happened to be on top.
 */
export function FormattingToolbar({ onFormat }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [linking, setLinking] = useState(false);
  // Which colour row is open under the buttons, if either.
  const [picking, setPicking] = useState<"color" | "highlight" | null>(null);
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
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setVisible(false); setPicking(null); return; }
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

  function colour(prop: "color" | "backgroundColor", value: string | null) {
    paint(prop, value);
    setPicking(null);
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
  const BUTTON = "w-7 h-7 rounded hover:bg-bg-soft flex items-center justify-center text-sm text-fg-muted hover:text-fg";

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
            <button onMouseDown={keepFocus} onClick={() => exec("bold")} aria-label="Bold" className={BUTTON + " font-bold"} title="Bold (Ctrl+B)">B</button>
            <button onMouseDown={keepFocus} onClick={() => exec("italic")} aria-label="Italic" className={BUTTON + " italic"} title="Italic (Ctrl+I)">I</button>
            <button onMouseDown={keepFocus} onClick={() => exec("underline")} aria-label="Underline" className={BUTTON + " underline"} title="Underline (Ctrl+U)">U</button>
            <button onMouseDown={keepFocus} onClick={() => exec("strikeThrough")} aria-label="Strikethrough" className={BUTTON + " line-through"} title="Strikethrough">S</button>
            <div className="w-px h-4 bg-bg-border" />
            <button
              onMouseDown={keepFocus}
              onClick={() => setPicking((p) => (p === "color" ? null : "color"))}
              aria-label="Text colour"
              aria-expanded={picking === "color"}
              className={BUTTON}
              title="Text colour"
            >
              <span className="border-b-[3px] border-rose-500 leading-none px-0.5">A</span>
            </button>
            <button
              onMouseDown={keepFocus}
              onClick={() => setPicking((p) => (p === "highlight" ? null : "highlight"))}
              aria-label="Highlight"
              aria-expanded={picking === "highlight"}
              className={BUTTON}
              title="Highlight"
            >
              <span className="bg-yellow-200 text-slate-900 leading-none px-1 rounded-sm">A</span>
            </button>
            <button onMouseDown={keepFocus} onClick={() => exec("removeFormat")} aria-label="Clear formatting" className={BUTTON + " text-xs"} title="Clear formatting — keeps links">
              T<sub className="text-[9px]">x</sub>
            </button>
            <div className="w-px h-4 bg-bg-border" />
            <button onMouseDown={keepFocus} onClick={startLinking} aria-label="Link" className={BUTTON + " text-xs underline"} title="Link">🔗</button>
          </>
        )}
        {picking && !linking ? (
          <div className="absolute left-0 top-full mt-1 p-2 rounded-lg bg-bg-card border border-bg-border shadow-xl space-y-2 w-max" role="group" aria-label={picking === "color" ? "Text colours" : "Highlights"}>
            <div className="flex items-center gap-1.5">
              <button
                onMouseDown={keepFocus}
                onClick={() => colour(picking === "color" ? "color" : "backgroundColor", null)}
                className="h-5 px-1.5 rounded text-[11px] border border-bg-border text-fg-muted hover:text-fg"
              >
                {picking === "color" ? "Default" : "None"}
              </button>
              {(picking === "color" ? TEXT_COLOURS : HIGHLIGHTS).map((c) => (
                <button
                  key={c}
                  onMouseDown={keepFocus}
                  onClick={() => colour(picking === "color" ? "color" : "backgroundColor", c)}
                  aria-label={c}
                  title={c}
                  className="w-5 h-5 rounded-full border border-bg-border hover:border-fg-subtle"
                  style={{ background: c }}
                />
              ))}
            </div>
            <SiteSwatches value="" size="sm" onPick={(ref) => colour(picking === "color" ? "color" : "backgroundColor", ref)} />
          </div>
        ) : null}
      </div>
    </Overlay>
  );
}
