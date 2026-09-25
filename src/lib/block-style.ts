/**
 * Background layers shared by the blocks that can sit behind content.
 *
 * A section and a single column paint the same thing — a colour, or an image
 * with an optional tint over it for legibility — so they build it here rather
 * than each growing their own copy that drifts.
 */
import { cleanFocus } from "./focus-point";
import type { CSSProperties } from "react";
import type { BackgroundGradient } from "@/types";
import { parseHex, readableTextFor, readableTextOn } from "./site-theme";
import { cssColor, cssLength } from "./css-value";
import { refFallback } from "./palette";

/**
 * Readable text for a backdrop, or null when the backdrop cannot say.
 *
 * Only a plain hex colour, or a palette colour or the accent by reference, is
 * answered for. "transparent", an rgba() with an alpha, or a photograph all
 * show something this function cannot see through, so it declines rather
 * than pinning the text to a colour that might be wrong — and the block keeps
 * whatever it was inheriting before.
 */
export function readableTextOnFlat(background: string): string | null {
  return readableTextFor(background);
}

export interface BackgroundLayer {
  /** Flat colour. Used only when there is no image and no gradient. */
  background?: string;
  /** Two colours blended. Used when there is no image, instead of `background`. */
  backgroundGradient?: BackgroundGradient;
  /** Image URL. Takes priority over `background`. */
  backgroundImage?: string;
  /** rgba() tint layered over the image so text stays readable. */
  backgroundOverlay?: string;
  /** What of the image stays in view as the box crops it; see `focus-point`. */
  backgroundFocus?: string;
}

/** The directions offered for a gradient, as the angle CSS reads. */
export const GRADIENT_DIRECTIONS = [
  { angle: 180, label: "Top to bottom" },
  { angle: 90, label: "Left to right" },
  { angle: 135, label: "Top left to bottom right" },
  { angle: 45, label: "Bottom left to top right" },
] as const;

/** An angle as a whole number of degrees from 0 to 359. */
export function normalizeAngle(value: number): number {
  return Number.isFinite(value) ? ((Math.round(value) % 360) + 360) % 360 : 180;
}

/**
 * A gradient as a CSS value, or undefined when either end is not a colour.
 *
 * Checked again here although the validator checked it on the way in: this is
 * written into an inline style, and a row saved before the validator knew
 * about gradients has only this between it and the page.
 */
export function gradientCss(gradient: BackgroundGradient | undefined): string | undefined {
  if (!gradient) return undefined;
  const from = cssColor(gradient.from);
  const to = cssColor(gradient.to);
  if (!from || !to) return undefined;
  return `linear-gradient(${normalizeAngle(gradient.angle)}deg, ${from}, ${to})`;
}

/**
 * Readable text across a gradient, or null.
 *
 * When both ends ask for the same text, that is the answer — and for two
 * palette colours it is their contrast token, which follows the palette. When
 * they disagree the text has to sit on both at once, so it is decided by the
 * colour halfway between them, read from the colours the ends had when they
 * were picked. Anything this cannot read declines, as a photograph does.
 */
function readableTextAcross(from: string, to: string): string | null {
  const a = readableTextFor(from);
  const b = readableTextFor(to);
  if (a && a === b) return a;
  const one = parseHex(from) ?? parseHex(refFallback(from));
  const two = parseHex(to) ?? parseHex(refFallback(to));
  if (!one || !two) return null;
  const mid = one.map((c, i) => Math.round((c + two[i]) / 2).toString(16).padStart(2, "0")).join("");
  return readableTextOn(`#${mid}`);
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
      // The point the author chose stays in view as the window reshapes the
      // box; without one the crop falls around the middle, as it always did.
      backgroundPosition: cleanFocus(layer.backgroundFocus) ?? "center",
    };
  }
  const gradient = gradientCss(layer.backgroundGradient);
  if (gradient && layer.backgroundGradient) {
    const text = readableTextAcross(layer.backgroundGradient.from, layer.backgroundGradient.to);
    return text ? { background: gradient, color: text } : { background: gradient };
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
