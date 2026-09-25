"use client";
import { useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { AccordionItem, AccordionProps } from "@/types";
import { Editable } from "./Editable";
import { cn } from "@/lib/utils";
import { domId } from "@/lib/dom-id";
import { TOKEN } from "@/lib/site-theme";
import { isBlank } from "@/lib/inline-text";
import { questionName, questionsOnPage } from "@/lib/accordion-page";
import {
  MAX_ACCORDION_ITEMS,
  newAccordionItem,
  openAtStart,
  pastedLines,
  remapOpen,
  sameItems,
  withOpened,
  withToggled,
} from "@/lib/accordion-editing";

interface Props {
  props: AccordionProps;
  onChange?: (next: AccordionProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

/** A read-only `Editable` still wants a handler; it never calls it. */
const ignore = () => {};

/**
 * Questions and answers, each answer folded under its question.
 *
 * On the page every item is a `<details>` with its question as the
 * `<summary>`, so opening one is the browser's own doing: it works in the
 * download, which carries no script at all, it is reached with Tab and opened
 * with Enter or Space, and a screen reader announces each question as
 * something that expands. "Opening one closes the others" is the same
 * element's `name` — items that share one behave as a group, natively. A
 * browser too old to know that simply lets several stay open, which loses
 * nothing anybody needs.
 *
 * The canvas draws the same boxes with the same classes out of plain
 * elements instead, for the reason `accordion-editing.ts` gives: a title
 * being typed into a `<summary>` opened and shut its answer on every space.
 */
export function Accordion({ props, onChange, disabled, blockId }: Props) {
  const className = cn("nvx-accordion", `nvx-accordion--${props.style}`);
  // The site's corner radius, handed to globals.css through one property so
  // the box, each card and the focus ring all bend by the same amount.
  const style = { "--nvx-accordion-radius": TOKEN.radius("0.75rem") } as CSSProperties;

  if (disabled || !onChange) {
    const name = props.exclusive ? domId(blockId) : undefined;
    // Rows with no words at all are left off; see `questionsOnPage`.
    const shown = questionsOnPage(props.items);
    return (
      <div className={className} style={style}>
        {shown.map(({ item, index }, n) => (
          <details key={index} className="nvx-accordion-item" name={name} open={props.openFirst && n === 0}>
            <summary className="nvx-accordion-summary">
              {isBlank(item.title) ? (
                <span className="nvx-accordion-title">{questionName(index)}</span>
              ) : (
                <Editable as="span" disabled value={item.title} onChange={ignore} className="nvx-accordion-title" />
              )}
              <span className="nvx-accordion-toggle" aria-hidden="true">
                <span className="nvx-accordion-marker" />
              </span>
            </summary>
            {isBlank(item.body) ? null : (
              <Editable as="div" disabled value={item.body} onChange={ignore} className="nvx-accordion-body" />
            )}
          </details>
        ))}
      </div>
    );
  }

  return <EditingAccordion props={props} onChange={onChange} className={className} style={style} />;
}

function EditingAccordion({
  props,
  onChange,
  className,
  style,
}: {
  props: AccordionProps;
  onChange: (next: AccordionProps) => void;
  className: string;
  style: CSSProperties;
}) {
  /*
    Which answers stand open on the canvas. It starts as the page starts —
    the first one open if the block says so — and starts again whenever
    "Start with the first one open" or "Opening one closes the others"
    changes, so either box shows its effect at once: ticking the second used
    to leave two answers open until the next click. It is never saved: the
    page opens its answers for each visitor, and this is only the author's
    view of them.

    It is kept with the list it was worked out against, so that when the
    list changes — a question moved, removed or added in the panel — each
    open answer can be found again by its words (`remapOpen`) rather than by
    a position that now belongs to a different question.

    Both adjustments happen during render, React's own pattern for state that
    follows a prop. Ignoring the stale state while a setting differed was
    tried first, and it came back to life when the box was ticked again: off
    and on showed the fourth answer open instead of the first.
  */
  const [shown, setShown] = useState(() => ({
    openFirst: props.openFirst,
    exclusive: props.exclusive,
    items: props.items,
    open: openAtStart(props.openFirst, props.items.length),
  }));
  let open = shown.open;
  if (shown.openFirst !== props.openFirst || shown.exclusive !== props.exclusive) {
    open = openAtStart(props.openFirst, props.items.length);
    setShown({ openFirst: props.openFirst, exclusive: props.exclusive, items: props.items, open });
  } else if (!sameItems(shown.items, props.items)) {
    open = remapOpen(shown.open, shown.items, props.items);
    setShown({ ...shown, items: props.items, open });
  }
  const show = (next: number[], items: AccordionItem[] = props.items) =>
    setShown({ openFirst: props.openFirst, exclusive: props.exclusive, items, open: next });
  const full = props.items.length >= MAX_ACCORDION_ITEMS;

  function update(i: number, patch: Partial<AccordionItem>) {
    const items = props.items.slice();
    items[i] = { ...items[i], ...patch };
    onChange({ ...props, items });
  }

  function add() {
    // Past the cap the validator would drop the new question on the next
    // render, so the click would seem to do nothing at all.
    if (full) return;
    const items = [...props.items, newAccordionItem()];
    onChange({ ...props, items });
    // Opened, so the answer is there to be typed over without hunting for it.
    show(withOpened(open, items.length - 1, props.exclusive), items);
  }

  function toggleFromRow(e: MouseEvent<HTMLDivElement>, i: number) {
    // A click in the title is a click to type there, never a toggle.
    if ((e.target as HTMLElement).closest(".inline-editable")) return;
    show(withToggled(open, i, props.exclusive));
  }

  /*
    Enter in an answer starts a new line. Left to itself, Chromium wraps the
    new line in a <div>, the inline-text sanitiser keeps the words and drops
    the <div>, and "one" Enter "two" was saved as "onetwo". A line break is
    what the sanitiser keeps and what the page's pre-wrap shows.
  */
  function keepLineBreak(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (!(e.target as HTMLElement).closest(".nvx-accordion-body")) return;
    e.preventDefault();
    document.execCommand("insertLineBreak");
  }

  // A paste arrives as plain text, a line at a time; `pastedLines` says why.
  function pastePlain(e: ClipboardEvent<HTMLDivElement>) {
    const field = (e.target as HTMLElement).closest(".nvx-accordion-title, .nvx-accordion-body");
    if (!field) return;
    e.preventDefault();
    const lines = pastedLines(e.clipboardData.getData("text/plain"), field.classList.contains("nvx-accordion-body"));
    lines.forEach((line, n) => {
      if (n > 0) document.execCommand("insertLineBreak");
      if (line) document.execCommand("insertText", false, line);
    });
  }

  return (
    <div className={cn(className, "relative")} style={style}>
      {props.items.length === 0 ? (
        <p className="px-5 py-4 text-sm opacity-60">No questions yet. Add one with the button below, or from the panel.</p>
      ) : null}
      {props.items.map((item, i) => {
        const isOpen = open.includes(i);
        return (
          <div
            key={i}
            className="nvx-accordion-item"
            data-open={isOpen ? "true" : "false"}
            onKeyDown={keepLineBreak}
            onPaste={pastePlain}
          >
            <div className="nvx-accordion-summary" onClick={(e) => toggleFromRow(e, i)}>
              <Editable
                as="span"
                value={item.title}
                onChange={(title) => update(i, { title })}
                placeholder={questionName(i)}
                className={cn("nvx-accordion-title", isBlank(item.title) && "nvx-accordion-blank")}
              />
              {/* The marker, made a real button here so the canvas can be
                  worked from the keyboard as the page can. Its click reaches
                  the row, which does the toggling, and the block beyond it,
                  which selects the block — as any click on the canvas does. */}
              <button
                type="button"
                className="nvx-accordion-toggle"
                aria-expanded={isOpen}
                aria-label={isOpen ? `Hide answer ${i + 1} on the canvas` : `Show answer ${i + 1} on the canvas`}
              >
                <span className="nvx-accordion-marker" aria-hidden="true" />
              </button>
            </div>
            {isOpen ? (
              <Editable
                as="div"
                multiline
                value={item.body}
                onChange={(body) => update(i, { body })}
                placeholder="Answer"
                className={cn("nvx-accordion-body", isBlank(item.body) && "nvx-accordion-blank")}
              />
            ) : null}
          </div>
        );
      })}
      {full ? (
        <p className="nvx-block-chrome absolute left-0 top-full z-10 mt-1 rounded-md bg-bg-card/95 border border-bg-border px-2 py-1 text-xs text-fg-muted shadow-lg">
          That is as many questions as one block holds.
        </p>
      ) : (
        <button
          type="button"
          onClick={add}
          className="nvx-block-chrome absolute left-0 top-full z-10 mt-1 rounded-md bg-bg-card/95 border border-bg-border px-2 py-1 text-xs text-fg-muted hover:text-fg shadow-lg"
        >
          + Add question
        </button>
      )}
    </div>
  );
}
