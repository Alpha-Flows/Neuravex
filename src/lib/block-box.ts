/**
 * The frame around a block: spacing, a border, a shadow and a fill.
 *
 * Only sections and columns had padding. Everything else sat flush against its
 * neighbours, so a page needing room between a heading and a paragraph got a
 * Spacer block — the templates hold hundreds of them — and a card, a quote in
 * a box or a framed picture had to be built as a section with one block in it.
 * A block of any type can carry a `box` now, beside its `layer` rather than in
 * its props, since it means the same thing whatever the block is.
 *
 * It is drawn by one component, `BlockFrame`, on the canvas and the published
 * page alike, so the two cannot disagree about where a block's frame is, and
 * the export takes it along as the inline style it is.
 *
 * Everything is optional and zero is left out, so an absent `box` — every
 * block authored before this — is drawn exactly as it was.
 */
import type { CSSProperties } from "react";
import type { BlockBox } from "@/types";
import { cssColor } from "./css-value";

/** The largest each length may be, in px. Room enough, and short of absurd. */
export const BOX_MAX = {
  padding: 200,
  margin: 400,
  borderWidth: 20,
  radius: 100,
} as const;

/** The shadows on offer, from a hairline to a card lifted off the page. */
export const SHADOWS = {
  none: "none",
  sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
  md: "0 4px 12px rgba(15, 23, 42, 0.10)",
  lg: "0 12px 32px rgba(15, 23, 42, 0.14)",
  xl: "0 24px 64px rgba(15, 23, 42, 0.18)",
} as const;

export type ShadowName = keyof typeof SHADOWS;
export const SHADOW_NAMES = Object.keys(SHADOWS) as ShadowName[];

export const BORDER_STYLES = ["solid", "dashed", "dotted"] as const;

/**
 * A border with no colour of its own: the text colour, faded, so it reads on
 * a light page and a dark one alike. A browser too old for `color-mix` drops
 * the declaration and draws the border in the text colour itself.
 */
export const DEFAULT_BORDER_COLOR = "color-mix(in srgb, currentColor 20%, transparent)";

/** A whole number of px from 0 to `max`, or nothing for zero and nonsense. */
function px(value: unknown, max: number): number | undefined {
  const n =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.round(Math.min(Math.max(n, 0), max));
  return clamped === 0 ? undefined : clamped;
}

/**
 * A block's box, repaired: lengths clamped into range, colours that are
 * colours, and nothing kept that draws nothing. Undefined when that leaves
 * nothing at all, so the stored block stays as small as it was.
 */
export function normalizeBox(raw: unknown): BlockBox | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const out: BlockBox = {};

  const paddingY = px(v.paddingY, BOX_MAX.padding);
  const paddingX = px(v.paddingX, BOX_MAX.padding);
  const marginTop = px(v.marginTop, BOX_MAX.margin);
  const marginBottom = px(v.marginBottom, BOX_MAX.margin);
  if (paddingY) out.paddingY = paddingY;
  if (paddingX) out.paddingX = paddingX;
  if (marginTop) out.marginTop = marginTop;
  if (marginBottom) out.marginBottom = marginBottom;

  // A style or a colour with no width draws no border, so neither is kept.
  const borderWidth = px(v.borderWidth, BOX_MAX.borderWidth);
  if (borderWidth) {
    out.borderWidth = borderWidth;
    const style = BORDER_STYLES.find((s) => s === v.borderStyle);
    if (style && style !== "solid") out.borderStyle = style;
    const color = cssColor(v.borderColor);
    if (color) out.borderColor = color;
  }

  const radius = px(v.radius, BOX_MAX.radius);
  if (radius) out.radius = radius;

  const shadow = SHADOW_NAMES.find((s) => s === v.shadow);
  if (shadow && shadow !== "none") out.shadow = shadow;

  const background = cssColor(v.background);
  if (background) out.background = background;

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The box as styles for the element the block is drawn in.
 *
 * No `overflow: hidden` with a radius, though a picture inside would then keep
 * its square corners: on the canvas the same element holds the block's
 * toolbar and handles, which sit outside it and would be cut off.
 */
export function boxStyle(box: BlockBox | undefined): CSSProperties {
  if (!box) return {};
  const style: CSSProperties = {};
  if (box.paddingY) {
    style.paddingTop = box.paddingY;
    style.paddingBottom = box.paddingY;
  }
  if (box.paddingX) {
    style.paddingLeft = box.paddingX;
    style.paddingRight = box.paddingX;
  }
  if (box.marginTop) style.marginTop = box.marginTop;
  if (box.marginBottom) style.marginBottom = box.marginBottom;
  if (box.borderWidth) {
    style.borderWidth = box.borderWidth;
    style.borderStyle = box.borderStyle ?? "solid";
    style.borderColor = box.borderColor || DEFAULT_BORDER_COLOR;
  }
  if (box.radius) style.borderRadius = box.radius;
  if (box.shadow && box.shadow !== "none") style.boxShadow = SHADOWS[box.shadow];
  if (box.background) style.backgroundColor = box.background;
  return style;
}

/**
 * The same block with part of its box changed, as the panel types it.
 *
 * Kept as typed rather than repaired, unlike `withLayer`: a colour is typed a
 * character at a time, and `#e2` repaired to nothing would empty the box the
 * author is typing into. The validator repairs it when the page is saved.
 * A value set back to zero or cleared is taken out, and a box left with
 * nothing in it is taken off the block.
 */
export function withBox<T extends { box?: BlockBox }>(block: T, patch: Partial<BlockBox>): T {
  const merged: Record<string, unknown> = { ...block.box, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "" || value === 0 || value === "none") delete merged[key];
  }
  if (Object.keys(merged).length === 0) {
    if (!block.box) return block;
    const { box: _dropped, ...rest } = block;
    return rest as T;
  }
  return { ...block, box: merged as BlockBox };
}
