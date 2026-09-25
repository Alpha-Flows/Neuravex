import type { MediaItem, SliderProps } from "@/types";

/**
 * How a slider finds its way from one picture to the next without a script.
 *
 * The downloaded site carries no JavaScript at all, so a slider there is a
 * row of pictures in a scrolling strip that snaps to one at a time, and every
 * control on it is a link to a picture's fragment. Following a fragment is
 * the one kind of scrolling a page can ask for with no code, and the browser
 * brings the strip round to the picture it names. What is left to decide —
 * which picture an arrow leads to, what each one is called, which of them are
 * drawn at all — is decided here, where it can be tested without a browser.
 */

/**
 * As many slides as one block keeps. The validator in `block-tree.ts` cuts a
 * longer list to this, and the panel and the canvas stop offering to add one
 * here, so the author is told rather than finding the thirty-first gone after
 * a save. `block-slider.test.ts` holds the two numbers together.
 */
export const MAX_SLIDES = 30;

/** The shapes a slider can be, in the order the panel offers them. */
export const SLIDER_RATIOS = ["16/9", "4/3", "1/1", "21/9"] as const satisfies readonly SliderProps["ratio"][];

/**
 * What each shape is called out loud. "16 / 9" read by a screen reader is
 * "sixteen slash nine", which says nothing about what the picture will look
 * like.
 */
export const SLIDER_RATIO_NAME: Record<SliderProps["ratio"], string> = {
  "16/9": "Widescreen, 16 by 9",
  "4/3": "Standard, 4 by 3",
  "1/1": "Square",
  "21/9": "Panoramic, 21 by 9",
};

/**
 * The picture an arrow leads to, going round at either end.
 *
 * A "next" on the last picture that led nowhere would be a dead button on
 * the page, and hiding it would move the control out from under a visitor
 * who had been clicking it. So the last leads to the first and the first
 * back to the last.
 */
export function neighbourSlide(position: number, count: number, step: 1 | -1): number {
  if (count <= 0) return 0;
  return (((position + step) % count) + count) % count;
}

/** How a slide introduces itself to a screen reader: "2 of 5". */
export function slidePositionLabel(position: number, count: number): string {
  return `${position + 1} of ${count}`;
}

export interface DrawnSlide {
  slide: MediaItem;
  /** Where the slide sits in the stored list, which is what an edit writes back to. */
  index: number;
}

/**
 * The slides that are drawn, and where each came from in the stored list.
 *
 * A slide whose address the validator refused — a `javascript:` source comes
 * back as an empty string — is kept in the list, so the author can see it in
 * the panel and choose another picture for it. On the canvas it is drawn as
 * an empty frame for the same reason. A visitor is shown nothing for it at
 * all: a broken picture between two good ones, with an arrow on each side and
 * a dot of its own, is a fault on somebody's website rather than a gap in it.
 */
export function slidesToDraw(slides: readonly MediaItem[] | undefined, editing: boolean): DrawnSlide[] {
  const out: DrawnSlide[] = [];
  (slides ?? []).forEach((slide, index) => {
    if (!slide || typeof slide !== "object") return;
    if (!editing && !slide.src) return;
    out.push({ slide, index });
  });
  return out;
}

export interface SliderControls {
  /** Round previous and next buttons on every slide. */
  arrows: boolean;
  /** One dot per slide beneath the pictures. */
  dots: boolean;
  /**
   * Whether the arrows are reached by Tab and read out.
   *
   * Every slide carries its own pair of arrows, so with dots as well a
   * keyboard met three stops per slide — thirty slides were ninety presses of
   * Tab — and focusing an arrow on a slide that was not showing scrolled the
   * strip to it, so the picture changed under every press. A screen reader
   * listed thirty links all called "Next slide". While the dots are drawn
   * they and the focusable strip do that job, one stop per slide, and the
   * arrows are for the pointer only. Without dots the arrows are all a
   * keyboard has, so they stay.
   */
  arrowsFocusable: boolean;
}

/** Which controls a slider draws. One picture has nowhere to move to, so it gets none. */
export function sliderControls(count: number, showArrows: boolean | undefined, showDots: boolean | undefined): SliderControls {
  const moves = count > 1;
  const arrows = moves && showArrows !== false;
  const dots = moves && showDots !== false;
  return { arrows, dots, arrowsFocusable: arrows && !dots };
}

/**
 * The longest description a slide keeps. The validator cuts a longer one to
 * this, and the panel's box stops at it, so the words an author sees are the
 * words that are stored. `block-slider.test.ts` holds the two together.
 */
export const SLIDE_ALT_MAX = 1000;
