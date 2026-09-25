import type { AccordionItem } from "@/types";

/**
 * What the editor needs to draw an accordion somebody can type into.
 *
 * The published accordion is a row of `<details>` elements and keeps its own
 * open state, which is the whole reason it works with no script. The canvas
 * cannot use them: a question typed into a `<summary>` is a question typed
 * into a button. In Chromium, a click to put the caret in the title opened
 * the item, and every space typed afterwards flipped it as well as inserting
 * itself, so typing "How long does it take" shut and reopened the answer
 * twice on the way. So the canvas draws the same boxes out of plain
 * elements, and which of them stand open is a small piece of editor state
 * that follows the page's own rules. These are those rules, kept here so
 * they can be tested without a browser.
 */

/**
 * As many questions as one block keeps. The validator in `block-tree.ts` cuts
 * a longer list to this, and the panel stops offering to add one here, so
 * the author is told rather than finding the hundred-and-first gone after a
 * save. `block-accordion.test.ts` holds the two numbers together.
 */
export const MAX_ACCORDION_ITEMS = 100;

/** What "+ Add question" puts on the end: words, so the new row is visible. */
export function newAccordionItem(): AccordionItem {
  return { title: "New question", body: "The answer to it." };
}

/**
 * The questions standing open before anybody has clicked, which is what a
 * visitor sees as the page loads: the first one when the block says so, and
 * none otherwise.
 */
export function openAtStart(openFirst: boolean, count: number): number[] {
  return openFirst && count > 0 ? [0] : [];
}

/**
 * The questions open once `index` has been opened. With `exclusive` set the
 * others close, exactly as the shared `name` makes them close on the page.
 */
export function withOpened(open: readonly number[], index: number, exclusive: boolean): number[] {
  if (exclusive) return [index];
  return open.includes(index) ? [...open] : [...open, index];
}

/** One click on a question's row: open it if it was closed, close it if not. */
export function withToggled(open: readonly number[], index: number, exclusive: boolean): number[] {
  return open.includes(index) ? open.filter((i) => i !== index) : withOpened(open, index, exclusive);
}

/** Two questions with the same words in them, wherever they sit in the list. */
export function sameItem(a: AccordionItem | undefined, b: AccordionItem | undefined): boolean {
  return !!a && !!b && a.title === b.title && a.body === b.body;
}

/** Whether two lists hold the same questions in the same order. */
export function sameItems(a: readonly AccordionItem[], b: readonly AccordionItem[]): boolean {
  return a.length === b.length && a.every((item, i) => sameItem(item, b[i]));
}

/**
 * The open answers carried across a change to the list.
 *
 * They used to be remembered by position alone, so moving the open question
 * down in the panel left its old place open — a different question — and
 * removing the one above it opened the one below. Positions are therefore
 * followed by content: each open question is looked for, by its words, in
 * the new list. Object identity would have been simpler and does not work,
 * because the validator rebuilds every item on every render.
 *
 * An edit in place comes first, because it changes one question's words and
 * nothing else: that question stays open where it is, even when another
 * question used to read exactly the same — two freshly added questions do —
 * and a content search would have opened the twin instead of the one being
 * typed into. When nothing matches, a list of the same length keeps the
 * position, and a list that grew or shrank lets it go.
 */
export function remapOpen(
  open: readonly number[],
  before: readonly AccordionItem[],
  after: readonly AccordionItem[],
): number[] {
  if (before.length === after.length) {
    const edited = before.filter((item, i) => !sameItem(item, after[i])).length;
    if (edited <= 1) return open.filter((i) => i < after.length);
  }
  const taken = new Set<number>();
  const out: number[] = [];
  for (const i of open) {
    const item = before[i];
    if (!item) continue;
    let to = sameItem(after[i], item) && !taken.has(i) ? i : after.findIndex((other, j) => !taken.has(j) && sameItem(other, item));
    if (to === -1 && before.length === after.length && !taken.has(i)) to = i;
    if (to === -1) continue;
    taken.add(to);
    out.push(to);
  }
  return out.sort((x, y) => x - y);
}

/**
 * What a paste puts into a question or an answer: plain text, as lines.
 *
 * The browser's own paste brought the copied page's markup with it. The
 * canvas showed its paragraphs and list items, the inline-text sanitiser kept
 * their words and dropped the elements around them, and an answer pasted as
 * two paragraphs and a list was stored as
 * "Para one.Para <b>two</b>.Item aItem b".
 * Inserting the plain text is not enough on its own either: Chromium turns
 * each newline of `insertText` into another `<div>`, which is lost the same
 * way. So an answer receives its lines one at a time with a line break
 * between them, which is what Enter does there. A question is one line, and
 * the lines of a paste become spaces in it.
 */
export function pastedLines(text: string, multiline: boolean): string[] {
  const normal = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return multiline ? normal.split("\n") : [normal.replace(/[ \t]*\n\s*/g, " ")];
}
