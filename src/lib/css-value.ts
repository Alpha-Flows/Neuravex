/**
 * A value on its way into a CSS custom property or an inline style.
 *
 * It lives apart from the rest of the sanitising because the branding that
 * uses it is rendered in the browser as well as on the server, and the CSS
 * sanitiser next door parses with postcss — a Node library, which has no
 * business in a browser bundle. This is a few characters of filtering with
 * nothing behind it, so it can go anywhere.
 */

/**
 * Validate CSS custom property values to prevent injection.
 * Only allows safe characters for font-family, colors, and CSS units.
 *
 * Quotes used to survive, which made a font family with one in it able to end
 * the string it was written into. A quoted font name still works — the quotes
 * are re-added below where they are needed — and nothing else needs one.
 */
export function sanitizeCssValue(value: string): string {
  // Allow: alphanumeric, spaces, commas, hashes, dots, parens, %, px, rem, em,
  //        hyphens, underscores. Not quotes: see above.
  return value.replace(/[^a-zA-Z0-9\s,#.()%_-]/g, "");
}

/**
 * A font stack, quoted the way CSS needs it.
 *
 * `'Helvetica Neue', Arial, sans-serif` has to keep its quotes to be a valid
 * font name, and `sanitizeCssValue` takes them out. So the stack is split, the
 * pieces are cleaned, and a piece with a space in it gets its quotes back —
 * from us, around a value that no longer contains one.
 */
export function cssFontStack(value: string): string {
  return value
    .split(",")
    .map((part) => sanitizeCssValue(part).trim())
    .filter(Boolean)
    .map((part) => (/\s/.test(part) ? `'${part}'` : part))
    .join(", ");
}

/** Colour names CSS defines that carry no punctuation to hide anything in. */
const NAMED_COLORS = new Set([
  "transparent", "currentcolor", "inherit", "initial", "unset", "revert",
  "black", "white", "red", "green", "blue", "yellow", "orange", "purple",
  "gray", "grey", "silver", "maroon", "olive", "lime", "aqua", "teal",
  "navy", "fuchsia", "magenta", "cyan", "pink", "brown", "beige", "gold",
  "indigo", "violet", "coral", "salmon", "khaki", "lavender", "ivory",
  "turquoise", "tan", "plum", "orchid", "crimson", "chocolate", "tomato",
]);

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** rgb/rgba/hsl/hsla with nothing but numbers, percentages and separators. */
const FUNCTIONAL = /^(?:rgba?|hsla?)\(\s*[-0-9.,%\s/degradturn]+\)$/i;
/** One of the site's own tokens, with an optional fallback that is itself checked. */
const VAR_TOKEN = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*))?\)$/i;

/**
 * A colour, or `undefined` when the value is not one.
 *
 * React serialises a style object without validating anything in it, so a
 * heading colour of `red;background:url(https://attacker/x)` rendered as two
 * declarations and the second one was a beacon. Quotes are escaped on that
 * path, so there was never a way out of the attribute into markup — but a
 * request per page view to whoever wrote the block is enough. The sink is
 * React, not `sanitize-html`, so filtering the sanitiser did not cover it.
 *
 * An empty string is a real answer here and means "whatever the site says",
 * which is the default for a new block; that is the caller's `?? ""`, not
 * this function's business.
 */
export function cssColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return undefined;
  // Anything that could start a second declaration or a comment, at all.
  if (/[;{}<>\\]/.test(v) || v.includes("/*")) return undefined;

  if (HEX.test(v)) return v;
  if (NAMED_COLORS.has(v.toLowerCase())) return v;
  if (FUNCTIONAL.test(v)) return v;

  const token = VAR_TOKEN.exec(v);
  if (token) {
    // A fallback is a colour too, and it is the part an author can write
    // anything into.
    const fallback = token[2]?.trim();
    if (!fallback) return v;
    return cssColor(fallback) !== undefined ? v : undefined;
  }

  return undefined;
}

/** The units a length may carry. */
const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|cm|mm|in)?$/i;

/**
 * A length, or `undefined`.
 *
 * Accepts a finite number, which is what the inspector produces, and a string
 * with one of the units above. `calc()` is deliberately not accepted: nothing
 * in the editor writes one, and its argument is another place to hide a call.
 */
export function cssLength(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? `${value}px` : undefined;
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (v === "0" || v === "auto" || v === "none") return v;
  return LENGTH.test(v) ? v : undefined;
}
