/**
 * The site's text sizes: each heading level and body text, set once.
 *
 * A heading's size was a class on the block — `text-5xl md:text-6xl` for a
 * level one — and a paragraph's was Small, Medium, Large or X-Large on the
 * block. A site that wanted smaller headings everywhere had to open every
 * heading and pick a smaller size on each, and a heading added the next day
 * came out at the old size again. These are the site's sizes instead; a
 * block that has not been given a size of its own follows them, and changing
 * one changes every page.
 *
 * Unset, nothing is emitted and every block is drawn by the classes it always
 * had, so a site that never opens this looks exactly as it did.
 *
 * A heading size is what it is on a wide window. Below 768px it is drawn at
 * four fifths of that, the same step the classes it replaces take there
 * (60px to 48px for a level one), so a large heading still fits a narrow
 * window.
 *
 * No dependencies: the settings panel and the canvas read this.
 */

export interface TextStyles {
  h1?: number;
  h2?: number;
  h3?: number;
  h4?: number;
  body?: number;
}

export type TextStyleKey = keyof TextStyles;

/** What each size is when the site sets none: the sizes the classes draw on a wide window. */
export const TEXT_STYLE_DEFAULTS: Required<TextStyles> = { h1: 60, h2: 48, h3: 30, h4: 24, body: 16 };

/** The smallest and largest each may be, in px. */
export const TEXT_STYLE_LIMITS: Record<TextStyleKey, [number, number]> = {
  h1: [16, 120],
  h2: [16, 120],
  h3: [12, 96],
  h4: [12, 72],
  body: [12, 28],
};

export const TEXT_STYLE_KEYS = Object.keys(TEXT_STYLE_LIMITS) as TextStyleKey[];

/** How a body text block's four sizes relate to the body size — the classes' own steps. */
const BODY_STEPS = { sm: 0.875, base: 1, lg: 1.125, xl: 1.25 } as const;

/** Below 768px a heading is drawn at this share of its size. */
export const NARROW_HEADING = 0.8;

/**
 * The sizes, repaired: whole px inside each one's limits, and nothing kept
 * that is not a number. Accepts the stored JSON or the object.
 */
export function normalizeTextStyles(raw: unknown): TextStyles {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const out: TextStyles = {};
  for (const key of TEXT_STYLE_KEYS) {
    const n = typeof v[key] === "number" ? (v[key] as number) : typeof v[key] === "string" && v[key] !== "" ? Number(v[key]) : NaN;
    if (!Number.isFinite(n)) continue;
    const [min, max] = TEXT_STYLE_LIMITS[key];
    out[key] = Math.round(Math.min(Math.max(n, min), max));
  }
  return out;
}

/** The class a heading drawn at level `n`'s size carries, so the site's size can find it. */
export function headingSizeClass(n: 1 | 2 | 3 | 4): string {
  return `nvx-heading-${n}`;
}

/** The class a text block of a given size carries, for the same reason. */
export function bodySizeClass(size: keyof typeof BODY_STEPS): string {
  return `nvx-text-${size}`;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/**
 * The rules for the sizes a site has set, scoped to `selector`.
 *
 * On a published page the body size goes on `<body>` rather than `:root`: a
 * size on the root element is what a rem is, and every rem-sized margin,
 * padding and heading on the page would have grown with it. In the editor it
 * goes on the canvas. Everything without a size of its own — a list, an
 * answer in an accordion — inherits it from there.
 */
export function textStylesCss(raw: unknown, selector = ":root"): string {
  const styles = normalizeTextStyles(raw);
  const rules: string[] = [];
  const wide: string[] = [];
  for (const n of [1, 2, 3, 4] as const) {
    const size = styles[`h${n}` as const];
    if (!size) continue;
    const target = `${selector} .${headingSizeClass(n)}`;
    rules.push(`${target} { font-size: ${px(size * NARROW_HEADING)}; }`);
    wide.push(`${target} { font-size: ${px(size)}; }`);
  }
  if (styles.body) {
    rules.push(`${selector === ":root" ? ":root body" : selector} { font-size: ${px(styles.body)}; }`);
    for (const [name, step] of Object.entries(BODY_STEPS)) {
      rules.push(`${selector} .${bodySizeClass(name as keyof typeof BODY_STEPS)} { font-size: ${px(styles.body * step)}; }`);
    }
  }
  if (wide.length > 0) rules.push(`@media (min-width: 768px) { ${wide.join(" ")} }`);
  return rules.join("\n");
}
