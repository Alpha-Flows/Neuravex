/**
 * Depth: which block sits over which, and where a floating one sits.
 *
 * The page was one flat stack. Blocks were laid out in the order they were
 * written and nothing could overlap anything, so dropping a text block onto a
 * picture pushed the picture down — and moving the picture back pushed the
 * text down instead. The one layout every landing page starts from, words over
 * a photograph, was the one layout this builder could not draw.
 *
 * So a block now carries a `layer`. Two independent pieces:
 *
 *   - `level` is the stacking order, and applies to every block, floating or
 *     not. It is a z-index, clamped to a range small enough to stay legible in
 *     the inspector and large enough for any page anyone is going to build.
 *   - `mode: "float"` lifts the block out of the flow. It stops taking room of
 *     its own — so nothing it overlaps moves — and is placed by `x`, `y` and
 *     `width`, each a percentage of the area it floats in.
 *
 * Percentages rather than pixels, because the same page is drawn at 1600px, at
 * 480px and in a column inside a section: a headline pinned 40px from the left
 * of a hero is somewhere else entirely on a phone, and one pinned at 8% is in
 * the same place at every width.
 *
 * Everything here is written so that an absent `layer` — every block authored
 * before this existed — means "in the flow, level 0", which is exactly what
 * the page did before.
 */
import type { CSSProperties } from "react";
import type { BaseBlock, BlockLayer } from "@/types";

/**
 * How far in front or behind a block may be put.
 *
 * A z-index is an integer and could be anything; this is a builder, and a
 * number people type into a box. Twenty levels either way is more than any
 * page needs and keeps the value something a person can reason about — and,
 * because the stack it applies in is isolated (see `.nvx-block-stack` in
 * globals.css), a negative level can never slide behind the section's own
 * background or out from under the page.
 */
export const MIN_LEVEL = -20;
export const MAX_LEVEL = 20;

/** How far outside its area a float may be pushed, as a percentage. */
const MIN_OFFSET = -100;
const MAX_OFFSET = 200;
const MIN_WIDTH = 2;
const MAX_WIDTH = 200;

/**
 * Where a block lands the moment it is set floating.
 *
 * Slightly inset and half the width, so it appears over whatever is behind it
 * rather than exactly on top of it — you can see both, and see that one of
 * them moved.
 */
export const FLOAT_START: Required<Pick<BlockLayer, "x" | "y" | "width">> = { x: 8, y: 8, width: 50 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A number, rounded to a tenth of a percent, or null when it is not one. */
function percent(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(clamp(value, min, max) * 10) / 10;
}

export function clampLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return clamp(Math.trunc(value), MIN_LEVEL, MAX_LEVEL);
}

/**
 * A percentage offset. `fallback` is what a value that is not a number at all
 * becomes — 0 when the caller is doing arithmetic and knows it has one, and
 * the starting placement when a stored block turns out to carry `"20"` or
 * `null` where a number should be.
 */
export function clampOffset(value: unknown, fallback = 0): number {
  return percent(value, MIN_OFFSET, MAX_OFFSET) ?? fallback;
}

export function clampWidth(value: unknown, fallback = FLOAT_START.width): number {
  return percent(value, MIN_WIDTH, MAX_WIDTH) ?? fallback;
}

/**
 * A stored `layer`, made into one we can render, or `undefined` when there is
 * nothing worth storing.
 *
 * Used on every write path through `normalizeBlockTree`, so an import, a
 * paste, or the MCP server cannot put a z-index of 2^31 or an `x` of
 * `"drop table"` onto a page. A layer that says nothing — flow, level 0 — is
 * dropped rather than stamped onto every block on the page, which is what
 * keeps a saved tree the same size it was.
 */
export function normalizeLayer(raw: unknown): BlockLayer | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const floating = value.mode === "float";
  const level = clampLevel(value.level);

  if (!floating) return level === 0 ? undefined : { mode: "flow", level };

  return {
    mode: "float",
    level,
    x: clampOffset(value.x, FLOAT_START.x),
    y: clampOffset(value.y, FLOAT_START.y),
    width: clampWidth(value.width),
  };
}

/** This block's layer, filled in — never undefined, so callers need no `??`. */
export function layerOf(block: Pick<BaseBlock, "layer">): Required<BlockLayer> {
  const layer = block.layer;
  const floating = layer?.mode === "float";
  return {
    mode: floating ? "float" : "flow",
    level: clampLevel(layer?.level),
    x: floating ? clampOffset(layer?.x, FLOAT_START.x) : FLOAT_START.x,
    y: floating ? clampOffset(layer?.y, FLOAT_START.y) : FLOAT_START.y,
    width: floating ? clampWidth(layer?.width) : FLOAT_START.width,
  };
}

export function isFloating(block: Pick<BaseBlock, "layer">): boolean {
  return block.layer?.mode === "float";
}

/** The same block with part of its layer changed, normalised on the way in. */
export function withLayer<T extends BaseBlock>(block: T, patch: Partial<BlockLayer>): T {
  const next = normalizeLayer({ ...layerOf(block), ...patch });
  if (!next) {
    if (!block.layer) return block;
    const { layer: _dropped, ...rest } = block;
    return rest as T;
  }
  return { ...block, layer: next };
}

/**
 * The two boxes a block is drawn in.
 *
 * A block in the flow is one element and `outer` is null: nothing is wrapped
 * around it and the page stacks exactly as it always did. A floating block
 * gets a wrapper, because two different things have to be said at once — the
 * wrapper spans the whole area (and, straight on the page, is held to the
 * site's content column so a float lines up with the text above it), and the
 * block inside is offset within that by `x` and sized by `width`.
 *
 * Doing it in one element would mean `left: x%` of the *page* while everything
 * around it is inside a 1200px column — the float would drift sideways as the
 * window widened. Two elements keep both true at every width.
 */
export interface LayerBoxes {
  /** The positioned wrapper, or null for a block in the flow. */
  outer: CSSProperties | null;
  /** What goes on the block itself. */
  inner: CSSProperties;
}

export function layerBoxes(block: Pick<BaseBlock, "layer">): LayerBoxes {
  const layer = layerOf(block);

  if (layer.mode !== "float") {
    // `z-index` only means anything on a positioned element, and the editor's
    // block wrapper is already `position: relative`. A public block is not,
    // so it is said here rather than assumed.
    return { outer: null, inner: layer.level === 0 ? {} : { position: "relative", zIndex: layer.level } };
  }

  return {
    outer: {
      position: "absolute",
      top: `${layer.y}%`,
      left: 0,
      right: 0,
      zIndex: layer.level,
    },
    inner: { marginLeft: `${layer.x}%`, width: `${layer.width}%` },
  };
}

/**
 * True when every block in a container floats.
 *
 * A container whose children all take no room is a container with no height,
 * and everything inside it lands on the same invisible line — on the canvas
 * and on the published page alike. Marked on the stack so CSS can give it
 * something to stand in, in both places, so the canvas is not showing a layout
 * the visitor never gets.
 */
export function floatsOnly(blocks: BaseBlock[]): boolean {
  return blocks.length > 0 && blocks.every(isFloating);
}

/** The levels used by a block's neighbours, for "bring to front" / "send to back". */
export function levelRange(blocks: BaseBlock[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const b of blocks) {
    const level = layerOf(b).level;
    if (level < min) min = level;
    if (level > max) max = level;
  }
  return { min, max };
}
