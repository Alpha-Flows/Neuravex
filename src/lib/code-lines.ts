import type { CodeToken } from "./code-highlight";

/**
 * A code sample as lines, and the two edits a code box makes to them.
 *
 * Kept apart from the component so the arithmetic can be tested without a
 * browser: an off-by-one in a selection is invisible in a screenshot and
 * obvious the first time somebody indents four lines and finds the fifth
 * has moved too.
 */

/** What one press of Tab puts in. Two spaces, because that is what the block's `tab-size` draws a tab as. */
export const INDENT = "  ";

/**
 * Tokens regrouped into lines, for the numbered view.
 *
 * A token is split wherever it holds a newline — a block comment or a
 * template string can run over several lines, and each line is its own
 * element there so the gutter can count it. There is always at least one
 * line, and an empty line is an empty list, so `n` newlines always make
 * `n + 1` lines: the numbering has to agree with the text box drawn over it,
 * and a text box counts a trailing newline as the start of another line.
 */
export function splitTokenLines(tokens: readonly CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: token.kind });
    });
  }
  return lines;
}

/** How many lines a sample has, counted the way a text box counts them. */
export function lineCount(code: string): number {
  let n = 1;
  for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) n += 1;
  return n;
}

/**
 * Whether the drawn sample needs one more newline than it holds to be as tall
 * as the text box over it.
 *
 * A browser draws `<pre>a\n</pre>` as one line — a newline at the very end of
 * a block starts nothing — while a text box holding "a\n" is two lines tall
 * with the caret on the second. On the canvas that left the caret below the
 * bottom of the sample after every Enter at the end. One extra newline at the
 * end is never drawn by itself, so adding it where the text already ends in
 * one (or is empty) makes the two agree without changing anything else, and
 * the published page gets it too so it is the same height as the canvas.
 */
export function needsTrailingLine(code: string): boolean {
  return code === "" || code.endsWith("\n");
}

export interface CodeEdit {
  value: string;
  start: number;
  end: number;
}

/**
 * Tab and Shift+Tab, as an editor for code does them.
 *
 * With the caret in one line, Tab puts two spaces at the caret (replacing
 * anything selected in that line). With a selection that crosses a line
 * break it indents every line the selection touches instead, since replacing
 * three selected lines with two spaces is never what that keypress means.
 * Shift+Tab takes up to two spaces, or one tab, off the start of every line
 * touched. The selection is carried along so the same lines stay selected
 * and a second press does the same again.
 *
 * A selection that ends at the very start of a line does not take that line
 * with it: dragging down over three whole lines leaves the end of the
 * selection at column 0 of the fourth, and the fourth was not chosen.
 */
export function indentCode(value: string, selectionStart: number, selectionEnd: number, outdent: boolean): CodeEdit {
  const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? Math.trunc(n) : 0, 0), value.length);
  const start = clamp(Math.min(selectionStart, selectionEnd));
  const end = clamp(Math.max(selectionStart, selectionEnd));
  const crossesLines = value.slice(start, end).includes("\n");

  if (!outdent && !crossesLines) {
    const caret = start + INDENT.length;
    return { value: value.slice(0, start) + INDENT + value.slice(end), start: caret, end: caret };
  }

  const lastPosition = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const starts: number[] = [];
  for (let at = value.lastIndexOf("\n", start - 1) + 1; ; ) {
    starts.push(at);
    const newline = value.indexOf("\n", at);
    if (newline === -1 || newline >= lastPosition) break;
    at = newline + 1;
  }

  if (!outdent) {
    let out = "";
    let from = 0;
    for (const at of starts) {
      out += value.slice(from, at) + INDENT;
      from = at;
    }
    out += value.slice(from);
    // A selection starting at column 0 stays there, so the spaces just added
    // are inside it and the whole lines are still selected.
    const shift = (pos: number) => pos + INDENT.length * starts.filter((at) => at < pos).length;
    return { value: out, start: shift(start), end: shift(end) };
  }

  const removed = starts.map((at) => {
    if (value[at] === "\t") return 1;
    let n = 0;
    while (n < INDENT.length && value[at + n] === " ") n += 1;
    return n;
  });
  let out = "";
  let from = 0;
  starts.forEach((at, i) => {
    out += value.slice(from, at);
    from = at + removed[i];
  });
  out += value.slice(from);
  // A position inside the removed spaces lands where they began.
  const shift = (pos: number) =>
    pos - starts.reduce((sum, at, i) => sum + Math.min(Math.max(pos - at, 0), removed[i]), 0);
  return { value: out, start: shift(start), end: shift(end) };
}
