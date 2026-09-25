/**
 * The picture at the start of the site's header.
 *
 * The default header drew a square in the accent colour beside the site's
 * name, and the only way to put a real logo there was to write the whole
 * header by hand in HTML — losing the menu, the shapes and the placement the
 * header settings give, for one picture. A logo is a setting of its own now:
 * a picture from the library, how tall it is drawn, and whether the name is
 * still written beside it (a logo that already spells the name does not want
 * it twice). The picture's text alternative is the site's name, which is what
 * the logo says.
 *
 * No dependencies beyond the URL rule: the settings panel reads this.
 */
import { isSafeHref } from "./url-safety";

export interface SiteLogo {
  src: string;
  /** Drawn height in px; the width follows the picture. */
  height: number;
  /** Whether the site's name is written beside the picture. */
  withName: boolean;
}

/** Room enough for a wordmark and a tall mark, inside the header's 64px. */
export const LOGO_HEIGHT = { min: 16, max: 56, default: 32 } as const;

/**
 * A logo that can be drawn, or null. The picture has to be an address a
 * picture can be at — a path of this builder or an http(s) address — which
 * `isSafeHref` alone does not say: `mailto:` and `#top` are safe links and not
 * pictures.
 */
export function normalizeLogo(raw: unknown): SiteLogo | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const src = typeof v.src === "string" ? isSafeHref(v.src.trim()) : undefined;
  if (!src || src.length > 2000 || !/^(?:\/(?!\/)|https?:\/\/)/i.test(src)) return null;
  const n = typeof v.height === "number" ? v.height : Number(v.height);
  const height = Number.isFinite(n) ? Math.round(Math.min(Math.max(n, LOGO_HEIGHT.min), LOGO_HEIGHT.max)) : LOGO_HEIGHT.default;
  return { src, height, withName: v.withName === true };
}
