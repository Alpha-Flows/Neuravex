"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { FormattingToolbar } from "./FormattingToolbar";
import { sanitizeInlineHtml } from "@/lib/sanitize";

interface Props {
  value: string;
  onChange: (v: string) => void;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}

/**
 * Inline editable element used in the editor. Tracks innerHTML so that
 * bold / italic / links inserted via execCommand are persisted correctly.
 * Public callers pass disabled={true} for a read-only element.
 *
 * Every keystroke is reported, not just the ones before a blur. Reporting
 * only on blur meant the text you had just typed existed nowhere but the
 * browser: the page was not marked dirty, so autosave had nothing to save,
 * Cmd+S wrote the previous version while the status line said "All saved",
 * and closing the tab lost the lot without a warning. The editor coalesces
 * these into one undo step per pause, so a report per keystroke does not
 * turn undo into a character-by-character rewind.
 */
export function Editable({
  value,
  onChange,
  as = "div",
  className,
  disabled,
  placeholder,
  multiline,
  style,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const lastValueRef = useRef<string>(value);
  // The formatting toolbar belongs to whichever element is being edited. One
  // per editable, all of them visible at once, meant a stack of identical
  // toolbars at the same spot, and a click landed on whichever happened to be
  // on top — not the block whose text was selected.
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /**
     * Never while somebody is typing in it.
     *
     * Assigning `innerHTML` destroys and rebuilds the children, and the caret
     * goes with them — back to the start of the element. That did not show
     * before, because what was reported back was the raw `innerHTML` and so
     * always compared equal to what was in the DOM. What is reported now is
     * the *sanitised* form, which differs in small ways the browser does not
     * care about (`<br>` against `<br />`, attribute order), so the comparison
     * failed on every keystroke and every keystroke put the caret back at
     * position zero. "Hello World" came out as "dlroWHello ".
     *
     * The element the person is editing is theirs until they leave it; the
     * value is synced into it when they are not in it.
     */
    if (document.activeElement === el) return;

    // On the way in: what is about to be parsed by the browser, on the
    // builder's origin, is only ever the inline-text profile.
    const clean = sanitizeInlineHtml(value);
    if (el.innerHTML !== clean) {
      el.innerHTML = clean;
      lastValueRef.current = clean;
    }
  }, [value]);

  const report = useCallback(() => {
    if (!ref.current) return;
    // On the way out: what autosave stores is the same profile, so markup
    // pasted into the element cannot survive a round trip. Comparing the
    // sanitised form against the last reported one also stops a paste that
    // sanitises to nothing from reporting an endless stream of changes.
    const html = sanitizeInlineHtml(ref.current.innerHTML);
    if (html !== lastValueRef.current) {
      lastValueRef.current = html;
      onChange(html);
    }
  }, [onChange]);

  const Tag = as as any;

  if (disabled) {
    return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(value) }} />;
  }

  return (
    <>
      {focused ? <FormattingToolbar onFormat={report} /> : null}
      <Tag
        ref={ref as any}
        className={`inline-editable ${className ?? ""}`}
        style={style}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onInput={report}
        onBlur={(e: any) => {
          // Toolbar buttons suppress their own mousedown, so they never take
          // focus. Its link field does, though, and the toolbar has to stay up
          // while a URL is being typed into it.
          const to = e.relatedTarget as HTMLElement | null;
          if (to?.closest?.("[data-formatting-toolbar]")) { report(); return; }
          setFocused(false);
          report();
        }}
        onKeyDown={(e: any) => {
          if (!multiline && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget as HTMLElement).blur();
          }
        }}
      />
    </>
  );
}
