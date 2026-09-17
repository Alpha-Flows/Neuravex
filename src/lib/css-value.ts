/**
 * A value on its way into a CSS custom property.
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
 */
export function sanitizeCssValue(value: string): string {
  // Allow: alphanumeric, spaces, commas, hashes, dots, parens, %, px, rem, em,
  //        single quotes, hyphens, underscores
  return value.replace(/[^a-zA-Z0-9\s,#.()%'"_-]/g, "");
}
