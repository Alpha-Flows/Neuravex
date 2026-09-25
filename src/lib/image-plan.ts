/**
 * What becomes of a picture on its way into the library: how large it is
 * kept, what it is stored as, and which smaller copies are made of it.
 *
 * A photograph off a phone is 4000 pixels across and several megabytes, and
 * it went onto the page as it arrived: a 10 MB PNG stayed 10 MB, for every
 * visitor on every page it was placed on, and in every download of the site.
 * No page is drawn wider than a few thousand pixels, and nobody's phone needs
 * more than a few hundred of them.
 *
 * The work is done in the browser, which already decodes every format the
 * library takes and can encode WebP, so the server needs no image library
 * and the machine it runs on no native one. This module is the arithmetic of
 * it, with nothing that needs a browser, so it can be tested; `image-prep`
 * does the drawing.
 */

/**
 * The longest edge a picture is kept at. Wide enough for a picture across a
 * large screen at twice its density, and for anything a page will draw.
 */
export const MAX_EDGE = 2400;

/**
 * The widths of the smaller copies: a phone, a tablet or a picture in a
 * column, and a laptop. A copy is only made when it would be meaningfully
 * smaller than the picture itself.
 */
export const VARIANT_WIDTHS = [480, 960, 1600] as const;

/** How good the encoded picture is, on the encoder's 0–1 scale. */
export const QUALITY = 0.82;

/**
 * The formats worth redrawing. Not GIF, which is kept for its animation;
 * not SVG, which is already as small as it gets and scales to any size; not
 * AVIF or ICO, which are already small, or small on purpose.
 */
const OPTIMISABLE = new Set(["jpg", "jpeg", "png", "webp"]);

/** The extension of a file name, lower-cased, or "". */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Whether a file is a picture this redraws. */
export function canOptimise(name: string): boolean {
  return OPTIMISABLE.has(extensionOf(name));
}

/**
 * Whether the first bytes of a file say it moves: an animated WebP, or an
 * animated PNG. Drawn onto a canvas, either keeps its first frame and loses
 * the rest, so an animation is sent as it is.
 */
export function isAnimated(head: Uint8Array): boolean {
  const text = String.fromCharCode(...head.subarray(0, Math.min(head.length, 4096)));
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") {
    // VP8X, and the animation bit of its flags.
    return text.slice(12, 16) === "VP8X" && (head[20] & 0x02) !== 0;
  }
  if (text.startsWith("\u0089PNG")) {
    // An animated PNG declares itself in an acTL chunk before its first IDAT.
    const idat = text.indexOf("IDAT");
    const actl = text.indexOf("acTL");
    return actl !== -1 && (idat === -1 || actl < idat);
  }
  return false;
}

/** The size a picture is kept at: its own, or scaled down to fit `MAX_EDGE`. */
export function keptSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * The copies to make of a picture kept `width` pixels across: each of
 * `VARIANT_WIDTHS` at least a fifth narrower than it. A copy almost as wide
 * as the picture saves a browser nothing worth a second file.
 */
export function variantWidths(width: number): number[] {
  return VARIANT_WIDTHS.filter((w) => w <= width * 0.8);
}

/**
 * Whether to keep the redrawn picture rather than the one that was chosen.
 * Always when it was made smaller in pixels; otherwise only when it is a tenth
 * lighter or better, since re-encoding a picture that was already well
 * compressed costs a little of its quality for nothing.
 */
export function keepRedrawn({ original, redrawn, resized }: { original: number; redrawn: number; resized: boolean }): boolean {
  if (redrawn <= 0) return false;
  return resized || redrawn <= original * 0.9;
}

/** The file name with its extension swapped: `Holiday.JPG` as `Holiday.webp`. */
export function renamed(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}

/** A copy's file name: `Holiday-480w.webp`. */
export function variantName(name: string, width: number, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}-${width}w.${ext}`;
}

export interface SizedFile {
  url: string;
  width: number;
}

/**
 * The `srcset` for a picture and its copies, widest first, or undefined when
 * there is nothing to choose between. The picture itself is in it when its
 * width is known — without that it cannot be described in the same terms as
 * the copies, and a list that mixes widths with nothing is not a list a
 * browser will read.
 */
export function srcSetOf(main: { url: string; width?: number | null }, copies: SizedFile[]): string | undefined {
  const all: SizedFile[] = [...copies];
  if (main.width) all.push({ url: main.url, width: main.width });
  const unique = [...new Map(all.filter((c) => c.width > 0).map((c) => [c.width, c])).values()];
  if (unique.length < 2) return undefined;
  return unique
    .sort((a, b) => b.width - a.width)
    .map((c) => `${c.url} ${c.width}w`)
    .join(", ");
}

/** Every `/uploads/…` address mentioned in a piece of text, once each. */
export function uploadAddresses(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\/uploads\/[A-Za-z0-9._-]+/g)) found.add(match[0]);
  return [...found];
}
