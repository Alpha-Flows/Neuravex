/**
 * Words on a block, as a person types them rather than as they are stored.
 *
 * Text a block shows is stored as inline HTML, because the canvas edits it in
 * place and the formatting toolbar can bold a word or link it. A panel that
 * puts that stored form straight into a text box is fine until somebody types
 * an ampersand: `R&D` goes in, the validator stores `R&amp;D`, and the next
 * time the page is opened that is what the box shows back — and a feature
 * reading `Q&amp;A sessions` in the inspector is the sort of thing an author
 * "fixes" and makes worse. These were written for the pricing panel and moved
 * here when the icon card's panel turned out to do the same to "Bed &
 * breakfast".
 *
 * So a panel shows plain words, and a field whose words have not changed
 * keeps whatever formatting it had. Only a field the author actually retypes
 * in the panel loses its bold, and a panel says so where there is any to lose.
 */

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The visible words of a piece of inline HTML, on one line. */
export function plainText(html: unknown): string {
  if (typeof html !== "string") return "";
  return (
    html
      // A forced line break reads as a space once it is on one line of a box.
      .replace(/<br\s*\/?>/gi, " ")
      // Tags first and entities second, so `&lt;b&gt;` written as text comes
      // back as the characters it spells rather than being taken for a tag.
      .replace(/<[^<>]*>/g, "")
      .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
        if (name[0] === "#") {
          const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
        }
        return NAMED[name.toLowerCase()] ?? entity;
      })
      // A newline inside inline HTML is a space in the browser. Kept as a
      // newline here it would split one feature into two in the panel.
      .replace(/[\r\n]+/g, " ")
  );
}

/** Words typed into a box, as inline HTML that shows exactly those words. */
export function textToHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * What to store when the panel's box for `previous` now reads `next`.
 *
 * The stored value is kept whenever its words are still the words in the box.
 * That is what lets a bolded plan name survive being looked at in the panel,
 * and it is also what keeps the caret where it is: the box is drawn from the
 * stored value on every keystroke, so a value that did not round-trip to the
 * same words would move the text under the author's fingers.
 */
export function editedText(previous: string, next: string): string {
  return plainText(previous) === next ? previous : textToHtml(next);
}

/** True when a piece of inline HTML carries formatting the panel cannot show. */
export function hasFormatting(html: string): boolean {
  return /<[a-z]/i.test(html);
}

/** True when nothing a visitor could read is there — `<br>`, spaces, `&nbsp;`. */
export function isBlank(html: unknown): boolean {
  return plainText(html).trim() === "";
}
