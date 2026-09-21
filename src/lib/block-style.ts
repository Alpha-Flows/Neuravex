/**
 * Background layers shared by the blocks that can sit behind content.
 *
 * A section and a single column paint the same thing — a colour, or an image
 * with an optional tint over it for legibility — so they build it here rather
 * than each growing their own copy that drifts.
 */
import type { CSSProperties } from "react";
import { parseHex, readableTextOn } from "./site-theme";
import { cssColor, cssLength } from "./css-value";

/**
 * Readable text for a backdrop, or null when the backdrop cannot say.
 *
 * Only a plain hex colour is answered for. "transparent", an rgba() with an
 * alpha, or a gradient all show something this function cannot see through,
 * so it declines rather than pinning the text to a colour that might be
 * wrong — and the block keeps whatever it was inheriting before.
 */
export function readableTextOnFlat(background: string): string | null {
  return parseHex(background) ? readableTextOn(background) : null;
}

export interface BackgroundLayer {
  /** Flat colour. Used only when there is no image. */
  background?: string;
  /** Image URL. Takes priority over `background`. */
  backgroundImage?: string;
  /** rgba() tint layered over the image so text stays readable. */
  backgroundOverlay?: string;
}

/**
 * Quote an image URL for CSS.
 *
 * A file named `hero (1).jpg` ends the `url(...)` early unquoted, which threw
 * away the rest of the declaration; a quote in the name would do the same to a
 * quoted one. Newlines cannot appear in a CSS string at all, so they go.
 */
export function cssUrl(src: string): string {
  const safe = src.replace(/[\r\n]+/g, "").replace(/["\\]/g, (c) => `\\${c}`);
  return `url("${safe}")`;
}

/**
 * The style for one background layer. Empty when nothing is set, so the
 * element keeps whatever it inherits instead of being painted transparent.
 *
 * A flat colour also sets the text colour, because a block is allowed to have
 * none of its own: an empty colour on a heading or a paragraph means "whatever
 * the page says", and on a dark backdrop the page said near-black. Dropping a
 * heading onto a dark section wrote #0f172a on #0b0f1e — the words were on the
 * page, at the right size, in the right place, and invisible. A block that
 * does carry a colour is untouched, so nothing already written moves.
 *
 * Only a flat colour can answer this. Behind a photograph the light is
 * whatever the photograph is, so nothing is claimed and the text keeps the
 * colour it was given.
 */
export function backgroundStyle(layer: BackgroundLayer | undefined): CSSProperties {
  if (!layer) return {};
  if (layer.backgroundImage) {
    const image = cssUrl(layer.backgroundImage);
    // The overlay is a colour or it is nothing. React writes a style object
    // out without checking it, so an overlay carrying a `;` used to render as
    // a second declaration.
    const overlay = cssColor(layer.backgroundOverlay);
    return {
      backgroundImage: overlay ? `linear-gradient(${overlay}, ${overlay}), ${image}` : image,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  const background = cssColor(layer.background);
  if (!background) return {};
  const text = readableTextOnFlat(background);
  return text ? { background, color: text } : { background };
}

/**
 * The style for one column of a columns block: its background, plus the inset
 * and rounding that make a column with an image behind it read as a card.
 *
 * Padding matters more here than on a section — without it the words sit hard
 * against the edge of the image.
 */
export function columnBoxStyle(
  style: (BackgroundLayer & { padding?: number; radius?: number }) | undefined,
): CSSProperties {
  if (!style) return {};
  const out: CSSProperties = { ...backgroundStyle(style) };
  const padding = cssLength(style.padding);
  const radius = cssLength(style.radius);
  if (style.padding && padding) out.padding = padding;
  if (style.radius && radius) out.borderRadius = radius;
  return out;
}
