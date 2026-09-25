"use client";
import { createContext, useContext } from "react";
import { accentRef, cleanHex, isAccentRef, paletteRef, paletteSlotOf } from "@/lib/palette";

/**
 * The site's accent and palette, for every colour field in the editor.
 *
 * A context rather than a prop: there are a dozen colour fields in as many
 * panels, and the formatting toolbar over the canvas offers the same colours,
 * so threading the palette through every panel's props would have touched
 * every panel to reach one field in each.
 */
export interface SiteColors {
  accent: string;
  /** Hex slots, "" for an empty one; see `normalizePalette`. */
  palette: string[];
}

const SiteColorsContext = createContext<SiteColors | null>(null);

export const SiteColorsProvider = SiteColorsContext.Provider;

/** The site's colours, or null outside the editor. */
export function useSiteColors(): SiteColors | null {
  return useContext(SiteColorsContext);
}

/**
 * The site's colours as buttons: the accent, then each palette slot in use.
 *
 * Picking one stores a reference to it rather than its hex (see
 * `lib/palette.ts`), so the block follows the site when the colour changes.
 * Shared by every colour field and by the formatting toolbar.
 */
export function SiteSwatches({
  value,
  onPick,
  withAccent = true,
  size = "md",
}: {
  value: string;
  onPick: (ref: string) => void;
  withAccent?: boolean;
  size?: "sm" | "md";
}) {
  const colors = useSiteColors();
  if (!colors) return null;
  const swatches = [
    ...(withAccent && cleanHex(colors.accent)
      ? [{ name: "Site accent", hex: cleanHex(colors.accent), ref: accentRef(cleanHex(colors.accent)), on: isAccentRef(value) }]
      : []),
    ...colors.palette.flatMap((hex, slot) =>
      hex ? [{ name: `Site colour ${slot + 1}`, hex, ref: paletteRef(slot, hex), on: paletteSlotOf(value) === slot }] : [],
    ),
  ];
  if (swatches.length === 0) return null;
  const box = size === "sm" ? "w-5 h-5" : "w-6 h-6";
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Site colours">
      {swatches.map((s) => (
        <button
          key={s.name}
          type="button"
          title={`${s.name} — ${s.hex}`}
          aria-label={s.name}
          aria-pressed={s.on}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s.ref)}
          className={`${box} rounded-full border-2 ${s.on ? "border-fg ring-2 ring-brand/60" : "border-bg-border hover:border-fg-subtle"}`}
          style={{ background: s.hex }}
        />
      ))}
    </div>
  );
}
