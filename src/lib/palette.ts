/**
 * The site's own colours, beside its accent.
 *
 * A site had one colour of its own, the accent, and every other colour was a
 * hex typed into a block. A brand's second and third colours were copied into
 * block after block, page after page, and changing one meant finding every
 * copy — and any copy missed kept the old colour. The palette is six slots
 * in the site's settings, offered as swatches in every colour field, and a
 * block given one stores a reference to the slot rather than its hex: change
 * the slot and every block that took it follows, the way a button without a
 * colour of its own follows the accent.
 *
 * The reference is `var(--site-color-2, #e8dcc4)`, a CSS custom property with
 * the colour it had when it was picked as the fallback. The validator already
 * takes a site token with a checked fallback as a colour, so nothing about
 * where colours are stored or checked had to change; and a block copied into
 * a site whose palette has no second colour still draws in the one it was
 * given.
 *
 * Slots rather than a list, so taking a colour out does not move the ones
 * after it: a block that took the third colour still has the third colour,
 * not whatever slid into its place.
 *
 * No dependencies: the colour fields in the inspector read this.
 */

export const PALETTE_SIZE = 6;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A hex colour as `#rrggbb`, lower case, or "" for anything else. */
export function cleanHex(value: unknown): string {
  if (typeof value !== "string") return "";
  const m = HEX.exec(value.trim());
  if (!m) return "";
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

/**
 * The palette, repaired: up to six slots, each a hex colour or empty, with
 * the empty ones at the end dropped. Accepts the stored JSON or the list.
 */
export function normalizePalette(raw: unknown): string[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const slots = value.slice(0, PALETTE_SIZE).map(cleanHex);
  while (slots.length > 0 && slots[slots.length - 1] === "") slots.pop();
  return slots;
}

/** The custom property a slot is published as. Slots count from one, as people do. */
export function paletteToken(slot: number): string {
  return `--site-color-${slot + 1}`;
}

/** What a block stores for a palette colour: the slot, with its colour today behind it. */
export function paletteRef(slot: number, hex: string): string {
  return `var(${paletteToken(slot)}, ${hex})`;
}

/** What a block stores for the accent, when it is picked as a swatch. */
export function accentRef(hex: string): string {
  return `var(--site-accent, ${hex})`;
}

const PALETTE_REF = /^var\(\s*--site-color-([1-6])\s*(?:,\s*([^()]*))?\)$/i;
const ACCENT_REF = /^var\(\s*--site-accent\s*(?:,\s*([^()]*))?\)$/i;

/** The slot a stored colour refers to, or -1 when it is not a palette colour. */
export function paletteSlotOf(value: string | null | undefined): number {
  const m = value ? PALETTE_REF.exec(value.trim()) : null;
  return m ? Number(m[1]) - 1 : -1;
}

/** Whether a stored colour is the accent, by reference. */
export function isAccentRef(value: string | null | undefined): boolean {
  return !!value && ACCENT_REF.test(value.trim());
}

/**
 * The colour a stored value draws as today, as a hex, or "" when it is not
 * one this can work out — for the colour picker, which only takes a hex, and
 * for choosing readable text in the editor.
 */
export function resolveColor(value: string | null | undefined, site: { accent?: string | null; palette?: string[] }): string {
  if (!value) return "";
  const v = value.trim();
  const slot = paletteSlotOf(v);
  if (slot >= 0) return site.palette?.[slot] || cleanHex(PALETTE_REF.exec(v)?.[2]);
  if (isAccentRef(v)) return cleanHex(site.accent) || cleanHex(ACCENT_REF.exec(v)?.[1]);
  return cleanHex(v);
}

/** The fallback a reference carries, as a hex, or "" — what it draws as with no site behind it. */
export function refFallback(value: string): string {
  const v = value.trim();
  return cleanHex(PALETTE_REF.exec(v)?.[2] ?? ACCENT_REF.exec(v)?.[1]);
}
