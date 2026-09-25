/**
 * A footer laid out from settings rather than written in HTML.
 *
 * The footer was a line of small print — the year, the site's name and the
 * legal links — or whatever HTML was typed into a box in the settings. A
 * footer with columns of links, an address, a phone number and the icons of
 * the site's profiles is what most sites end with, and every one of those
 * meant writing markup by hand, getting the columns to fold on a phone, and
 * finding the `{legal}` placeholder in the documentation so the Impressum did
 * not drop off every page. Each part is a setting here instead: up to four
 * columns of links, a line about the site, contact details, profiles, a
 * copyright line and a background. The legal links are always drawn beneath
 * it, as they are beneath every footer.
 *
 * Custom footer HTML, where a site has some, still wins, as it always has; a
 * site with neither keeps the small-print footer.
 *
 * Dependency-light on purpose: the settings panel and the published page both
 * read this.
 */
import type { SocialLink, SocialNetwork } from "@/types";
import { isSafeHref } from "./url-safety";
import { cssColor } from "./css-value";
import { SOCIAL_ICONS } from "./social-icons";
import { MAX_SOCIAL_HREF, normaliseSocialHref } from "./social-links";
import { fragmentLink } from "./anchors";

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface FooterDesign {
  /** A line or two under the site's name. */
  about: string;
  columns: FooterColumn[];
  contact: { address: string; phone: string; email: string };
  social: SocialLink[];
  /** `{year}` and `{name}` are filled in. Empty means "© {year} {name}". */
  copyright: string;
  /** A colour, or empty for the page's own. */
  background: string;
}

export const FOOTER_LIMITS = { columns: 4, links: 8, social: 12, label: 60, about: 300, address: 300, line: 120 } as const;

export const DEFAULT_COPYRIGHT = "© {year} {name}";

/** An empty design, which is where the settings panel starts one. */
export function emptyFooter(): FooterDesign {
  return { about: "", columns: [], contact: { address: "", phone: "", email: "" }, social: [], copyright: "", background: "" };
}

function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string") return "";
  const v = multiline ? value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : value.replace(/\s+/g, " ");
  return v.trim().slice(0, max);
}

function link(raw: unknown): FooterLink | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const label = text(v.label, FOOTER_LIMITS.label);
  const typed = typeof v.href === "string" ? v.href.trim() : "";
  const href = typed && typed.length <= 2000 ? isSafeHref(typed) : undefined;
  return label && href ? { label, href } : null;
}

const NETWORKS = new Set(Object.keys(SOCIAL_ICONS));

/**
 * The design, repaired, or null when it has nothing in it to draw — which is
 * also how a site says it wants the small-print footer back. Accepts the
 * stored JSON or the object.
 */
export function normalizeFooter(raw: unknown): FooterDesign | null {
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

  const columns = (Array.isArray(v.columns) ? v.columns : [])
    .slice(0, FOOTER_LIMITS.columns)
    .map((c) => {
      const col = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const links = (Array.isArray(col.links) ? col.links : []).slice(0, FOOTER_LIMITS.links).map(link).filter(Boolean) as FooterLink[];
      return { title: text(col.title, FOOTER_LIMITS.label), links };
    })
    .filter((c) => c.title || c.links.length > 0);

  const contactRaw = (v.contact && typeof v.contact === "object" ? v.contact : {}) as Record<string, unknown>;
  const contact = {
    address: text(contactRaw.address, FOOTER_LIMITS.address, true),
    phone: text(contactRaw.phone, FOOTER_LIMITS.line),
    email: text(contactRaw.email, FOOTER_LIMITS.line),
  };

  // Finished and checked the way the Social links block does it, so `@you`
  // under Instagram becomes the profile's address rather than a relative link.
  const social = (Array.isArray(v.social) ? v.social : [])
    .slice(0, FOOTER_LIMITS.social)
    .flatMap((s) => {
      const item = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const network = (NETWORKS.has(String(item.network)) ? item.network : "website") as SocialNetwork;
      const typed = typeof item.href === "string" && item.href.length <= MAX_SOCIAL_HREF ? item.href : "";
      const href = typed ? (isSafeHref(normaliseSocialHref(network, typed)) ?? "") : "";
      return href ? [{ network, href }] : [];
    });

  const design: FooterDesign = {
    about: text(v.about, FOOTER_LIMITS.about, true),
    columns,
    contact,
    social,
    copyright: text(v.copyright, FOOTER_LIMITS.line),
    background: cssColor(v.background) ?? "",
  };
  const empty =
    !design.about && columns.length === 0 && !contact.address && !contact.phone && !contact.email && social.length === 0 && !design.copyright;
  return empty ? null : design;
}

/** The copyright line with its year and name filled in. */
export function footerCopyright(design: Pick<FooterDesign, "copyright">, site: { name: string }, year = new Date().getFullYear()): string {
  return (design.copyright || DEFAULT_COPYRIGHT).replace(/\{year\}/g, String(year)).replace(/\{name\}/g, site.name);
}

/** A phone number as a `tel:` address: the digits and a leading plus, nothing else. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return digits.replace(/\D/g, "").length >= 3 ? `tel:${digits}` : null;
}

/** An email address as a `mailto:` address, when it looks like one. */
export function mailHref(email: string): string | null {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? `mailto:${email}` : null;
}

/** A column link as the page writes it: a typed `#prices` put in the page's id space. */
export function footerLinkHref(href: string): string {
  return fragmentLink(href);
}

/** The design with every link address passed through `map`, for a rename. */
export function retargetFooter(raw: unknown, map: (href: string) => string): FooterDesign | null {
  const design = normalizeFooter(raw);
  if (!design) return null;
  return { ...design, columns: design.columns.map((c) => ({ ...c, links: c.links.map((l) => ({ ...l, href: map(l.href) })) })) };
}
