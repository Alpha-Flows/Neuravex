/**
 * Putting the two documents on the site, and keeping them there.
 *
 * They are written as ordinary pages, not as a fixed route the app serves:
 * they get a slug, they publish, they appear in the sitemap, they go into the
 * download as `impressum.html` and `datenschutz.html`, and they open in the
 * builder where a typo can be fixed. What marks them out is `legalKind` on
 * the page, which is how the footer finds them, how they stay out of the
 * header nav, and how regenerating knows which two pages to rewrite rather
 * than adding a third.
 */

import { BaseBlock } from "@/types";
import { SiteLook, readSiteLook } from "../page-starters";
import { SiteAudit, auditSite } from "./audit";
import { LegalProfile } from "./profile";
import { buildDatenschutz } from "./datenschutz";
import { buildImpressum } from "./impressum";

export type LegalKind = "impressum" | "datenschutz";

export const LEGAL_PAGES: { kind: LegalKind; slug: string; title: string; metaTitle: string }[] = [
  { kind: "impressum", slug: "impressum", title: "Impressum", metaTitle: "Impressum" },
  { kind: "datenschutz", slug: "datenschutz", title: "Datenschutzerklärung", metaTitle: "Datenschutzerklärung" },
];

export function isLegalKind(value: unknown): value is LegalKind {
  return value === "impressum" || value === "datenschutz";
}

/**
 * The content of one document.
 *
 * The look is read off the site's own pages — the same reader the New page
 * starters use — so the Impressum is in the site's colours and column width
 * instead of arriving as a white page in the middle of a dark site. Legal
 * pages are excluded from that reading: once they exist they would otherwise
 * be voting on what the site looks like, and two left-aligned 4xl sections
 * can outvote a one-page site's real bands.
 */
export function buildLegalPage(
  kind: LegalKind,
  profile: LegalProfile,
  audit: SiteAudit,
  look: SiteLook,
): BaseBlock[] {
  return kind === "impressum" ? buildImpressum(profile, look) : buildDatenschutz(profile, audit, look);
}

export interface LegalSourcePage {
  title: string;
  content: string;
  legalKind: string | null;
}

export interface LegalSite {
  pages: LegalSourcePage[];
  headerHtml?: string | null;
  footerHtml?: string | null;
  favicon?: string | null;
  ogImage?: string | null;
}

/** Both documents, built from one site's pages and settings in one go. */
export function buildLegalPages(
  profile: LegalProfile,
  site: LegalSite,
): { audit: SiteAudit; look: SiteLook; pages: Record<LegalKind, string> } {
  const ordinary = site.pages.filter((p) => !isLegalKind(p.legalKind));
  const audit = auditSite({
    pages: ordinary.map((p) => ({ title: p.title, content: p.content })),
    headerHtml: site.headerHtml,
    footerHtml: site.footerHtml,
    favicon: site.favicon,
    ogImage: site.ogImage,
  });
  const look = readSiteLook(ordinary.map((p) => p.content));
  return {
    audit,
    look,
    pages: {
      impressum: JSON.stringify(buildLegalPage("impressum", profile, audit, look)),
      datenschutz: JSON.stringify(buildLegalPage("datenschutz", profile, audit, look)),
    },
  };
}
