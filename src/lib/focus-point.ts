/**
 * The part of a picture that must stay in view when it is cropped.
 *
 * A picture drawn into a shape that is not its own — a section's background
 * across a wide window, a square gallery tile, a slide — is cut down to fit,
 * and it was always cut around its middle. A portrait whose face is in the
 * top third lost the face on a wide section; a landscape with its subject at
 * one side lost the subject in a square tile. The author could see it and
 * had nothing to do about it but crop the file by hand and upload it again.
 *
 * So a picture placed in a crop can carry a point, as a position CSS reads —
 * `object-position` on a picture, `background-position` behind a section —
 * and the browser keeps that point in view whatever shape it is cut to. The
 * file is untouched: the same picture can be placed twice with a different
 * point each time, and changing one's mind costs nothing.
 *
 * No dependencies: the inspector, the blocks and the validator all read this.
 */

export interface FocusPoint {
  /** 0 is the left edge, 100 the right. */
  x: number;
  /** 0 is the top edge, 100 the bottom. */
  y: number;
}

export const CENTRE: FocusPoint = { x: 50, y: 50 };

const POSITION = /^\s*(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/;

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** A stored point as numbers; the centre for anything unreadable. */
export function parseFocus(value: unknown): FocusPoint {
  const match = typeof value === "string" ? POSITION.exec(value) : null;
  return match ? { x: clamp(Number(match[1])), y: clamp(Number(match[2])) } : CENTRE;
}

/** A point as it is stored, `"30% 20%"`, or undefined for the centre, which is where a crop falls anyway. */
export function focusValue(point: FocusPoint): string | undefined {
  const x = clamp(point.x);
  const y = clamp(point.y);
  return x === 50 && y === 50 ? undefined : `${x}% ${y}%`;
}

/**
 * A stored point, repaired: two percentages, whole numbers between 0 and 100,
 * or nothing. What goes into a `style` attribute is only ever this, so the
 * value cannot carry a second declaration with it.
 */
export function cleanFocus(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !POSITION.test(raw)) return undefined;
  return focusValue(parseFocus(raw));
}

/** The point under a click on a picture drawn in `rect`. */
export function focusAt(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): FocusPoint {
  if (rect.width <= 0 || rect.height <= 0) return CENTRE;
  return { x: clamp(((clientX - rect.left) / rect.width) * 100), y: clamp(((clientY - rect.top) / rect.height) * 100) };
}

/** The shapes an image block can be cut to, as the CSS `aspect-ratio` each is. */
export const IMAGE_SHAPES = [
  { value: "original", label: "As the picture is" },
  { value: "1/1", label: "Square" },
  { value: "4/3", label: "Landscape — 4:3" },
  { value: "3/2", label: "Landscape — 3:2" },
  { value: "16/9", label: "Wide — 16:9" },
  { value: "3/4", label: "Portrait — 3:4" },
] as const;

export type ImageShape = (typeof IMAGE_SHAPES)[number]["value"];

/** The `aspect-ratio` for a shape, or undefined for the picture's own. */
export function shapeRatio(shape: string | undefined): string | undefined {
  if (!shape || shape === "original") return undefined;
  return IMAGE_SHAPES.some((s) => s.value === shape) ? shape.replace("/", " / ") : undefined;
}
