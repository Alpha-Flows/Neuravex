/**
 * The blocks both legal documents are built out of.
 *
 * They are ordinary pages. Nothing here renders HTML or a PDF: it produces
 * the same block tree the editor works on, wearing the look read off the
 * site's own pages, so an Impressum opens in the builder like any other page
 * and can be corrected there by whoever is liable for it. That matters more
 * than it sounds — a generated document nobody can edit is a document that
 * goes stale the first time a company moves office.
 */

import { BaseBlock } from "@/types";
import { uid } from "../utils";
import { SiteLook } from "../page-starters";
import { LegalAddress } from "./profile";

export function block(type: BaseBlock["type"], props: Record<string, unknown>, children?: BaseBlock[]): BaseBlock {
  return children ? { id: uid(), type, props, children } : { id: uid(), type, props };
}

/**
 * A legal document reads left to right down a column, never centred and never
 * across the full width of a wide window: it is prose to be read, not a
 * landing page. The colours and background are the site's own, so it still
 * belongs to the site it is part of.
 */
export function legalSection(look: SiteLook, children: BaseBlock[], band = false): BaseBlock {
  return block(
    "section",
    {
      background: band ? look.bandBackground : look.background,
      paddingY: Math.max(48, Math.min(look.paddingY, 96)),
      paddingX: look.paddingX,
      maxWidth: "4xl",
      align: "left",
    },
    children,
  );
}

/**
 * A heading in a document rather than on a landing page.
 *
 * The level is the real one — h1 for the title, h2 for each section — so the
 * outline a screen reader walks is correct. The size is set apart from it,
 * two steps down, because a page of prose set in hero type is a page nobody
 * reads.
 */
export function h(look: SiteLook, text: string, level: 1 | 2 | 3 = 2, color = look.headingColor): BaseBlock {
  const size = level === 1 ? 2 : 4;
  return block("heading", { text, level, size, align: "left", color, weight: level === 1 ? "bold" : "semibold" });
}

export function p(look: SiteLook, text: string, color = look.textColor, size: "sm" | "base" | "lg" = "base"): BaseBlock {
  return block("text", { text, align: "left", size, color });
}

export function bullets(items: string[], style: "bullet" | "number" | "check" = "bullet"): BaseBlock {
  return block("list", { style, items });
}

export function space(height: number): BaseBlock {
  return block("spacer", { height });
}

export function rule(look: SiteLook): BaseBlock {
  return block("divider", { style: "solid", color: look.mutedColor, thickness: 1 });
}

/**
 * Several lines as one paragraph.
 *
 * An address is not a list and should not be set as one: the text block keeps
 * the newlines it is given, so the lines stack the way a letterhead sets them
 * and a screen reader reads one address rather than four bullet points.
 */
export function stacked(look: SiteLook, values: string[], color = look.textColor): BaseBlock {
  return p(look, values.join("\n"), color);
}

/** An address on its own lines, the way a letterhead sets it. */
export function addressLines(address: LegalAddress): string[] {
  const lines: string[] = [];
  if (address.street.trim()) lines.push(address.street.trim());
  if (address.extra.trim()) lines.push(address.extra.trim());
  const town = [address.postalCode.trim(), address.city.trim()].filter(Boolean).join(" ");
  if (town) lines.push(town);
  if (address.country.trim()) lines.push(address.country.trim());
  return lines;
}

/** The same, as one line — for a sentence rather than a block. */
export function addressInline(address: LegalAddress): string {
  return addressLines(address).join(", ");
}

/** Drops the empty entries a half-filled profile leaves behind. */
export function lines(...values: (string | false | null | undefined)[]): string[] {
  return values.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}
