/**
 * Writing the two documents onto a site, and rewriting them afterwards.
 *
 * Separate from `pages` because it talks to the database, which `pages` must
 * not: the flow builds a live preview in the browser out of the same
 * builders, and a Prisma client cannot go there.
 */

import { prisma } from "../prisma";
import { slugify } from "../utils";
import { snapshotRevision } from "../revisions";
import { LEGAL_PAGES, LegalKind, buildLegalPages } from "./pages";
import { LegalProfile } from "./profile";
import { SiteAudit } from "./audit";

export interface AppliedPage {
  kind: LegalKind;
  id: string;
  slug: string;
  title: string;
  /** True when this run created the page rather than rewriting it. */
  created: boolean;
}

/**
 * A free slug for a legal page.
 *
 * `impressum` is the address a German visitor and a search engine both expect,
 * so it is tried first. If something else already lives there — a page the
 * operator wrote themselves — it is left alone and the generated page takes
 * the next free address rather than overwriting somebody's work.
 */
async function freeSlug(siteId: string, wanted: string, ownId: string | null): Promise<string> {
  let slug = slugify(wanted);
  const base = slug;
  let suffix = 0;
  for (;;) {
    const clash = await prisma.page.findUnique({ where: { siteId_slug: { siteId, slug } } });
    if (!clash || clash.id === ownId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

/**
 * Generate both documents and put them on the site, published.
 *
 * Rerunning it rewrites the same two pages rather than adding two more — they
 * are found by `legalKind`, not by their address, so renaming the Impressum
 * to `/anbieterkennzeichnung` does not cost you the link between the details
 * and the page. Anything already on a generated page is put into its revision
 * history first: regenerating after somebody hand-edited the text would
 * otherwise throw that edit away silently, and the history is where they will
 * look for it.
 */
export async function applyLegalPages(
  siteId: string,
  profile: LegalProfile,
): Promise<{ applied: AppliedPage[]; audit: SiteAudit }> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      headerHtml: true,
      footerHtml: true,
      favicon: true,
      ogImage: true,
      pages: { select: { id: true, title: true, content: true, legalKind: true, sortOrder: true } },
    },
  });
  if (!site) throw new Error("Site not found");

  const { audit, pages: content } = buildLegalPages(profile, {
    pages: site.pages,
    headerHtml: site.headerHtml,
    footerHtml: site.footerHtml,
    favicon: site.favicon,
    ogImage: site.ogImage,
  });

  // Legal pages sort to the end, so they do not sit between real pages in the
  // admin list or in the sitemap.
  const lastOrder = site.pages.reduce((max, p) => Math.max(max, p.sortOrder), -1);
  let order = lastOrder + 1;
  const applied: AppliedPage[] = [];

  for (const spec of LEGAL_PAGES) {
    const existing = site.pages.find((p) => p.legalKind === spec.kind);

    if (existing) {
      if (existing.content !== content[spec.kind]) {
        await snapshotRevision(existing.id, {
          title: existing.title,
          content: existing.content,
          manual: true,
        });
      }
      const updated = await prisma.page.update({
        where: { id: existing.id },
        data: { content: content[spec.kind], published: true },
        select: { id: true, slug: true, title: true },
      });
      applied.push({ kind: spec.kind, ...updated, created: false });
      continue;
    }

    const created = await prisma.page.create({
      data: {
        siteId,
        title: spec.title,
        slug: await freeSlug(siteId, spec.slug, null),
        legalKind: spec.kind,
        content: content[spec.kind],
        published: true,
        isHome: false,
        sortOrder: order++,
        metaTitle: spec.metaTitle,
      },
      select: { id: true, slug: true, title: true },
    });
    applied.push({ kind: spec.kind, ...created, created: true });
  }

  return { applied, audit };
}
