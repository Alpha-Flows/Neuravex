import { domId } from "./dom-id";

/**
 * How many pictures one gallery keeps.
 *
 * The block-tree schema cuts a longer list to this length on the way in, and
 * the editor stops offering "Add picture" when a gallery reaches it — two
 * places that have to agree, so `block-gallery.test.ts` holds them to the
 * same number. Sixty is a long page of photographs already; every one of
 * them is a request the visitor's browser makes, and a lightbox of its own.
 */
export const GALLERY_MAX_PICTURES = 60;

/** Where one picture's overlay sits, and where each of its links goes. */
export interface LightboxLinks {
  /** The overlay's own id — what the tile links to, and what `:target` matches. */
  id: string;
  /** The tile's id. Closing the overlay goes back to it. */
  tile: string;
  /** The neighbouring overlays, absent when there is no neighbour to go to. */
  previous?: string;
  next?: string;
}

/**
 * The ids a gallery's lightbox is built from, one set per picture.
 *
 * The lightbox is a set of anchors and a `:target` rule, because the
 * downloaded site carries no script at all: a tile links to its picture's
 * overlay, the overlay links to its neighbours, and closing it is one more
 * link. So every one of these is a URL fragment, and each comes from `domId`,
 * which keeps them page-unique and safe in an `href` whatever the block's id
 * holds.
 *
 * Closing goes back to the tile that was open rather than to the top of the
 * gallery. Following a fragment moves focus to its target when the target can
 * take it, so a keyboard reader who opened picture 40 lands back on picture
 * 40 — not on the first row of a sixty-picture grid, thirty-nine tabs away
 * from where they were — and a mouse reader comes back to the row they were
 * looking at.
 *
 * Stepping wraps round, so the last picture's "next" is the first. A gallery
 * of one picture has nowhere to step to and gets neither link, rather than
 * two links that each lead back to the picture already showing.
 */
export function lightboxLinks(blockId: string | undefined, count: number): LightboxLinks[] {
  const n = Math.max(0, Math.trunc(count));
  const overlay = (i: number) => domId(blockId, "photo", i + 1);
  return Array.from({ length: n }, (_, i) => ({
    id: overlay(i),
    tile: domId(blockId, "tile", i + 1),
    ...(n > 1 ? { previous: overlay((i - 1 + n) % n), next: overlay((i + 1) % n) } : {}),
  }));
}

/**
 * What a tile is called to a screen reader: "Open picture 2 of 6: A misty
 * forest path".
 *
 * The tile is a link, and a link's name is what gets read out and what a
 * reader picks it by from a list of links. The picture's own description
 * alone said what was in it but not that following it opens anything, and
 * sixty links all called "Open picture" said nothing about which one.
 */
export function openLabel(position: number, count: number, alt: string | undefined): string {
  const described = (alt ?? "").trim();
  const base = `Open picture ${position} of ${count}`;
  return described ? `${base}: ${described}` : base;
}
