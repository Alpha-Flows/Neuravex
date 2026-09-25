import type { AccordionItem } from "@/types";
import { isBlank } from "./inline-text";

/**
 * What a question with no words is called: its placeholder on the canvas and
 * its name on the page, so the author sees in advance what a visitor will.
 */
export function questionName(index: number): string {
  return `Question ${index + 1}`;
}

/**
 * The questions an accordion draws on the page, each with its place in the
 * list.
 *
 * A question emptied on the canvas is stored as a lone `<br />`, and drawn
 * as it was it made a `<summary>` with nothing in it: a row with only a
 * chevron to look at, and nothing for a screen reader to call it. A row with
 * no words on either side is left off the page. One with an answer but no
 * question stays, and is named by `questionName`, so the answer can still be
 * reached and the row still says what it is. The place in the list is kept
 * rather than counted afresh, so that name is the one the canvas showed.
 */
export function questionsOnPage(items: readonly AccordionItem[]): { item: AccordionItem; index: number }[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isBlank(item.title) || !isBlank(item.body));
}
