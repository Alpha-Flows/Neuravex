import { hasFormatting, isBlank, plainText, textToHtml } from "./inline-text";
import { iconLabel } from "./icon-names";

/**
 * A card's title or text as the editor reported it, or nothing when it holds
 * no words.
 *
 * The card draws a title only when there is one, because a heading with
 * nothing in it is still a heading: a screen reader lists it among the
 * page's headings and reads it out with no name. The first version tested
 * the stored string for being empty, and emptying a title on the canvas
 * never made it empty — Chrome leaves a `<br>` in a contentEditable heading
 * once the last character goes, so the caret has a line to sit on, and the
 * editor faithfully saved that as the title. The published card kept an
 * `<h3><br /></h3>` that nobody could see to delete. So what counts is the
 * text a reader would get, which is what `isBlank` measures, not the markup
 * around it.
 */
export function wordsOrNothing(html: string): string {
  return isBlank(html) ? "" : html;
}

/**
 * Where a card's text breaks a line: a `<br>` from the canvas, or a newline
 * written by an agent through the MCP server, which the card keeps because
 * it draws its text with `white-space: pre-wrap`.
 */
const LINE_BREAKS = /<br\s*\/?>|\r\n|\r|\n/gi;

/**
 * A card's text for the panel's box, one line of the box per line of the card.
 *
 * `plainText` puts everything on one line, which is right for a title or a
 * plan's feature and wrong here: a card that reads "Open Monday to Friday"
 * over "Closed at weekends" showed the two run together in the box, and the
 * next keystroke stored them that way.
 */
export function textForBox(html: unknown): string {
  if (typeof html !== "string") return "";
  return html.split(LINE_BREAKS).map(plainText).join("\n");
}

/**
 * What to store when the text box for `previous` now reads `next`.
 *
 * The rule is `editedText`'s, with line breaks counted as words: text whose
 * lines read the same is kept as it was, bold and all, and once anything is
 * retyped the whole text is stored as the words typed, each line break in
 * the box becoming the `<br>` the canvas would have written for it. Kept
 * whole rather than line by line, because a bold run can cross a break and
 * splitting it would store half a tag on each side.
 */
export function textFromBox(previous: string, next: string): string {
  if (textForBox(previous) === next) return previous;
  return next.split(/\r\n|\r|\n/).map(textToHtml).join("<br />");
}

/**
 * Whether the text carries formatting its box cannot show. A line break is not
 * formatting here — the box shows it and keeps it — although `hasFormatting`,
 * written for one-line fields, counts `<br>` among the tags.
 */
export function textHasFormatting(html: string): boolean {
  return hasFormatting(html.replace(LINE_BREAKS, ""));
}

/**
 * What the outline calls an icon block: its title, or its text, or else
 * what the icon shows.
 *
 * The outline's general rule reads `text` before `title`, which suits a
 * block whose text is the point of it and not this one. A row of three
 * feature cards came out as the first words of three descriptions — "Pages
 * load in a blink, on every co…" — rather than the three titles an author
 * would look for, and a lone icon came out as `map-pin`.
 */
export function iconOutlineName(props: unknown): string {
  const p = (props && typeof props === "object" ? props : {}) as Record<string, unknown>;
  const words = (plainText(p.title).trim() || plainText(p.text).trim()).replace(/\s+/g, " ");
  if (!words) return iconLabel(p.icon);
  return words.length > 34 ? `${words.slice(0, 34)}…` : words;
}
