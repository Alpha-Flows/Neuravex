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

import { sanitizeCssValue, cssFontStack } from "./css-value";

export interface SiteThemeInput {
  accent?: string | null;
  fontFamily?: string | null;
  headingFont?: string | null;
  borderRadius?: string | null;
  contentWidth?: string | null;
}

/** Used when a site has nothing set, and as the CSS fallback in every block. */
/** Side padding on the page's column, in rem. */
export const GUTTER = 1.5;

export const THEME_FALLBACK = {
  accent: "#6366f1",
  radius: "0.5rem",
  /** 1152px — the width the header and footer have always used. */
  contentWidth: "72rem",
} as const;

/** The widths offered in settings, narrow to edge-to-edge. */
export const CONTENT_WIDTHS = [
  { value: "60rem", label: "Narrow", hint: "960px" },
  { value: "72rem", label: "Standard", hint: "1152px" },
  { value: "80rem", label: "Wide", hint: "1280px" },
  { value: "96rem", label: "Extra wide", hint: "1536px" },
  { value: "none", label: "Full width", hint: "fills the window" },
] as const;

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
  // A font stack keeps the quotes a multi-word family needs — put back
  // around a cleaned value, never carried through from the input.
  if (site.fontFamily) declarations.push(`--site-font: ${cssFontStack(site.fontFamily)}`);
  if (site.headingFont) declarations.push(`--site-heading-font: ${cssFontStack(site.headingFont)}`);
  if (site.borderRadius) declarations.push(`--site-radius: ${sanitizeCssValue(site.borderRadius)}`);
  // How wide the page's content column runs. "none" lets it fill the window.
  //
  // Two variables, because they are measured differently: a section already
  // supplies its own side padding and wants the bare content width, while a
  // block sitting straight on the page carries the gutter with it and needs
  // room for both — otherwise the two start 24px apart on a wide window.
  const width = site.contentWidth?.trim();
  if (width) {
    const bare = width === "none" ? "none" : sanitizeCssValue(width);
    declarations.push(`--site-content-width: ${bare}`);
    declarations.push(`--site-column-max: ${bare === "none" ? "none" : `calc(${bare} + ${GUTTER * 2}rem)`}`);
  }

  const headings = ["h1", "h2", "h3", "h4", "h5", "h6"]
    .map((h) => `${selector} ${h}`)
    .join(", ");

  return [
    `${selector} { ${declarations.join("; ")}; font-family: var(--site-font, inherit); }`,
    `${headings} { font-family: var(--site-heading-font, inherit); }`,
  ].join("\n");
}

/**
 * How much room a page has to leave at the top for its header. A fixed header
 * is out of the flow, so without this the first block starts underneath it:
 * 4rem tall, plus a 1px bottom border on the bar shape, plus a 1rem margin on
 * the pill.
 *
 * It lives here rather than beside the header component: that component is a
 * client one, and a plain function exported across that boundary is not
 * callable from the server page that renders it.
 */
export function headerOffset(site: { headerShape: string }): number {
  return site.headerShape === "pill" ? 80 : site.headerShape === "rounded" ? 64 : 65;
}
