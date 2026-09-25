/**
 * Which of an audio block's words are drawn.
 *
 * Only the ones with something in them — an empty title left standing as a
 * placeholder made the canvas taller than the page it stood for — except the
 * one being typed in. The first version had no exception, and backspacing a
 * title to nothing took the element away from under the caret: focus fell to
 * the page, and the next Backspace was the editor's shortcut for deleting the
 * selected block, so clearing a title one key too far deleted the whole
 * player. A field that has the caret stays until the caret leaves it, and an
 * emptied one goes then.
 *
 * Kept apart from the component so the rule can be tested without drawing
 * anything; the test suite has no DOM.
 */

export type AudioField = "title" | "description";

/** Whether a piece of inline HTML says anything once its tags are gone. */
export function hasText(html: string | undefined | null): boolean {
  if (!html) return false;
  const plain = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;| /gi, " ")
    .trim();
  return plain.length > 0;
}

export function shownFields(
  props: { title?: string; description?: string },
  focused: AudioField | null,
): Record<AudioField, boolean> {
  return {
    title: hasText(props.title) || focused === "title",
    description: hasText(props.description) || focused === "description",
  };
}
