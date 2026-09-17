/**
 * Site branding, as CSS custom properties.
 *
 * A site's accent colour, fonts and corner radius used to reach the header
 * logo square and nothing else: every button carried its own hex and every
 * heading its own colour, so changing a brand colour meant opening every
 * button on every page. These tokens are emitted once per page, and a block
 * that has no colour of its own reads them — so the accent is set in one
 * place and the whole site follows.
 *
 * A block keeps the right to its own colour. An empty value means "whatever
 * the site says", which is the default for new blocks.
 */

import { sanitizeCssValue } from "./security";

export interface SiteThemeInput {
  accent?: string | null;
  fontFamily?: string | null;
  headingFont?: string | null;
  borderRadius?: string | null;
}

/** Used when a site has nothing set, and as the CSS fallback in every block. */
export const THEME_FALLBACK = {
  accent: "#6366f1",
  radius: "0.5rem",
} as const;

/** The token a block reads, with the fallback baked in for pages without a theme. */
export const TOKEN = {
  accent: `var(--site-accent, ${THEME_FALLBACK.accent})`,
  accentContrast: "var(--site-accent-contrast, #ffffff)",
  radius: (fallback: string) => `var(--site-radius, ${fallback})`,
} as const;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** #rgb or #rrggbb to its three channels, or null for anything else. */
export function parseHex(color: string): [number, number, number] | null {
  const m = HEX.exec(color.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Whether text on this background should be light. Perceived brightness, so a
 * saturated yellow counts as light and a mid blue as dark.
 */
export function isDarkColor(color: string): boolean {
  const rgb = parseHex(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** Readable text on the given background — white on dark, near-black on light. */
export function readableTextOn(color: string): string {
  return isDarkColor(color) ? "#ffffff" : "#0f172a";
}

/**
 * The stylesheet for one site's branding.
 *
 * `selector` is `:root` on a published page, where the branding owns the whole
 * document, and `.public-canvas` in the editor, where it must not leak out of
 * the canvas and repaint the builder's own chrome.
 */
export function siteThemeCss(site: SiteThemeInput, selector = ":root"): string {
  const accent = site.accent && parseHex(site.accent) ? site.accent.trim() : THEME_FALLBACK.accent;
  const declarations = [
    `--site-accent: ${accent}`,
    `--site-accent-contrast: ${readableTextOn(accent)}`,
  ];
  if (site.fontFamily) declarations.push(`--site-font: ${sanitizeCssValue(site.fontFamily)}`);
  if (site.headingFont) declarations.push(`--site-heading-font: ${sanitizeCssValue(site.headingFont)}`);
  if (site.borderRadius) declarations.push(`--site-radius: ${sanitizeCssValue(site.borderRadius)}`);

  const headings = ["h1", "h2", "h3", "h4", "h5", "h6"]
    .map((h) => `${selector} ${h}`)
    .join(", ");

  return [
    `${selector} { ${declarations.join("; ")}; font-family: var(--site-font, inherit); }`,
    `${headings} { font-family: var(--site-heading-font, inherit); }`,
  ].join("\n");
}
