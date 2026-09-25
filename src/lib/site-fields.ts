import { parseHex, THEME_FALLBACK } from "./site-theme";
import { isSafeHref } from "./url-safety";
import { MAX_CSS_BYTES } from "./css-safety";
import { sanitizeHtml } from "./sanitize";
import { normalizeCustomFonts } from "./fonts";
import { normalizePalette } from "./palette";
import { normalizeTextStyles } from "./text-styles";

/**
 * What a site's settings are allowed to be, in one place.
 *
 * `PATCH /api/sites/[id]` allowlisted `headerShape` and `headerPosition`,
 * regex-checked `language` and clamped `headerOpacity`. Import did none of
 * that: it copied every field out of the archive verbatim, so an archive could
 * store `headerShape: "<b>x"`, `language: '"><script>'` and
 * `headerOpacity: 999`. Rendering absorbed all of it — React escapes `lang`
 * and the switch statements fall through to defaults — so it was a trust
 * boundary with nothing on it rather than a live bypass. `create_site` over
 * MCP and trash restore were the same.
 *
 * The accent was the one that mattered. `siteThemeCss()` checks it with
 * `parseHex()`, but three other sinks write it straight into an inline style,
 * one of them the builder's own dashboard — so an accent of
 * `#fff 0%, #000 100%);background-image:url(https://attacker/ping);/*` made
 * the owner's browser call an attacker on every visit to the site list,
 * without the poisoned site ever being opened.
 */

const HEADER_SHAPES = new Set(["bar", "rounded", "pill"]);
const HEADER_POSITIONS = new Set(["static", "sticky", "fixed"]);
const LANGUAGE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

/** How much custom header or footer markup one site may carry. */
const MAX_CHROME_HTML = 64 * 1024;

/**
 * An accent colour, or the fallback.
 *
 * Never `undefined`: this is read at render as well as at write, so a row
 * stored before any of this existed still comes out as a colour.
 */
export function safeAccent(value: unknown, fallback: string = THEME_FALLBACK.accent): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!parseHex(trimmed)) return fallback;
  // parseHex tolerates a missing `#`, which is a valid hex triple to it and an
  // invalid property value to a browser — the button then loses its
  // background rather than falling back to the default.
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/** A favicon or social image: this site's own file, or an http(s) address. */
function safeAssetUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const href = isSafeHref(trimmed);
  if (href === undefined) return null;
  return /^(?:mailto|tel):/i.test(href) ? null : href;
}

function optionalString(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.slice(0, max);
  return trimmed;
}

export interface NormalizeOptions {
  /**
   * Fill in a default for every field the input does not carry.
   *
   * A PATCH means "change these"; a create means "this is the whole site", and
   * the difference is whether an absent field is left alone or defaulted.
   */
  complete?: boolean;
}

/**
 * The settings a site may be written with.
 *
 * Only the keys that survived validation are present, so a caller can spread
 * the result straight into a Prisma `data` without re-checking anything.
 */
export function normalizeSiteFields(
  input: Record<string, unknown>,
  { complete = false }: NormalizeOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (key: string) => input[key] !== undefined;

  if (typeof input.name === "string") out.name = input.name.trim().slice(0, 300) || "Untitled site";
  else if (complete) out.name = "Untitled site";

  const description = optionalString(input.description, 2000);
  if (description !== undefined) out.description = description;
  else if (complete) out.description = null;

  if (has("accent") || complete) out.accent = safeAccent(input.accent);

  for (const key of ["fontFamily", "headingFont", "borderRadius", "contentWidth"] as const) {
    const value = optionalString(input[key], 200);
    if (value !== undefined) out[key] = value;
    else if (complete) out[key] = null;
  }

  // The site's own font files go into a `<style>` element as `@font-face`
  // rules, so the list is repaired to names and upload paths that cannot end
  // one — and stored as the repaired JSON, never as it arrived.
  if (has("fonts") || complete) {
    const fonts = normalizeCustomFonts(input.fonts);
    out.fonts = fonts.length > 0 ? JSON.stringify(fonts) : null;
  }

  // Both are read into the page's stylesheet, so they are stored repaired —
  // hex slots and whole pixel sizes — and never as they arrived.
  if (has("palette") || complete) {
    const palette = normalizePalette(input.palette);
    out.palette = palette.length > 0 ? JSON.stringify(palette) : null;
  }
  if (has("textStyles") || complete) {
    const sizes = normalizeTextStyles(input.textStyles);
    out.textStyles = Object.keys(sizes).length > 0 ? JSON.stringify(sizes) : null;
  }

  if (has("headerBackground") || complete) out.headerBackground = safeAccent(input.headerBackground, "#ffffff");

  if (typeof input.headerOpacity === "number" && Number.isFinite(input.headerOpacity)) {
    out.headerOpacity = Math.max(0, Math.min(100, Math.round(input.headerOpacity)));
  } else if (typeof input.headerOpacity === "string" && input.headerOpacity.trim() !== "" && Number.isFinite(Number(input.headerOpacity))) {
    out.headerOpacity = Math.max(0, Math.min(100, Math.round(Number(input.headerOpacity))));
  } else if (complete) {
    out.headerOpacity = 80;
  }

  if (typeof input.headerShape === "string" && HEADER_SHAPES.has(input.headerShape)) out.headerShape = input.headerShape;
  else if (complete) out.headerShape = "bar";

  if (typeof input.headerPosition === "string" && HEADER_POSITIONS.has(input.headerPosition)) {
    out.headerPosition = input.headerPosition;
  } else if (complete) {
    out.headerPosition = "sticky";
  }

  // Header and footer markup is written into the page around every block, so
  // it is sanitised at the door rather than only at render — the export
  // writes it into a file that has no CSP behind it.
  for (const key of ["headerHtml", "footerHtml"] as const) {
    const value = optionalString(input[key], MAX_CHROME_HTML);
    if (value !== undefined) out[key] = value === null ? null : sanitizeHtml(value);
    else if (complete) out[key] = null;
  }

  const css = optionalString(input.customCss, MAX_CSS_BYTES);
  if (css !== undefined) out.customCss = css;
  else if (complete) out.customCss = null;

  for (const key of ["metaTitle", "metaDescription"] as const) {
    const value = optionalString(input[key], 1000);
    if (value !== undefined) out[key] = value;
    else if (complete) out[key] = null;
  }

  // Both become an off-origin fetch on every page load if they name one, which
  // is by design for the settings UI — but `javascript:` is not a picture.
  for (const key of ["ogImage", "favicon"] as const) {
    if (has(key) || complete) out[key] = safeAssetUrl(input[key]);
  }

  if (typeof input.language === "string" && LANGUAGE.test(input.language.trim())) {
    out.language = input.language.trim();
  } else if (complete) {
    out.language = "en";
  }

  // `legal` is a JSON blob the legal wizard owns; it is carried across import
  // as-is and validated by the wizard's own schema when it is read.
  if (has("legal") || complete) out.legal = input.legal ?? null;

  return out;
}
