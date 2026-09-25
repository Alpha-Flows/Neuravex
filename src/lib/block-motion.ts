/**
 * How a block comes into view as the page is scrolled to it.
 *
 * Done with a scroll-driven CSS animation and nothing else, because a
 * published page runs no script of a block's own and a downloaded one runs
 * none at all. A browser without scroll-driven animations — Firefox and
 * Safari when this was written — skips the rule and shows the block as it
 * always was, and so does anyone who has asked their system for less motion.
 *
 * The animation is finished once the block is fully in view or 14rem into it,
 * whichever comes first. Timed to "fully in view" alone, a block taller than
 * the window stayed faded until its top reached the top of the window, and
 * the words in it were read half-transparent. Timed to a fixed distance
 * alone, a short block at the foot of a page that cannot scroll any further
 * never travelled that far and stayed faded for good.
 *
 * Stored as `motion` beside `layer` and `box`, since it means the same thing
 * whatever the block is. It plays on the published page and in the editor's
 * Preview, not while editing, where blocks fading in as the canvas scrolls
 * would get in the way of the work.
 */

export const MOTIONS = ["fade", "rise", "left", "right", "zoom"] as const;
export type BlockMotion = (typeof MOTIONS)[number];

export const MOTION_LABEL: Record<BlockMotion, string> = {
  fade: "Fade in",
  rise: "Rise",
  left: "From the left",
  right: "From the right",
  zoom: "Grow",
};

/** A motion the page knows how to draw, or nothing. */
export function normalizeMotion(raw: unknown): BlockMotion | undefined {
  return MOTIONS.find((m) => m === raw);
}
