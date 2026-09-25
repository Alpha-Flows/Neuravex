/**
 * Changing a page's address, the one way it is done.
 *
 * There were three: the editor's save, the pages PATCH the dashboard uses, and
 * the MCP server's `save_page`. Each found a free slug with its own copy of
 * the same loop, and only the PATCH moved the site's links afterwards — so a
 * page renamed in the editor, which is where nearly everybody renames one,
 * left every button and menu link written to its old address pointing at a
 * 404, while the same rename from the dashboard carried them across.
 *
 * A rename also leaves the old address behind. Links inside the site follow
 * the page; the ones outside it — a search result, a bookmark, a link from
 * somebody else's site, the address printed on a flyer — cannot be reached
 * from here, so the old address is kept as a `PageRedirect` and forwards to
 * wherever the page is now. Only a published page's: a draft's address was
 * never public, and nobody outside can have written it down.
 */

import { prisma } from "./prisma";
import { slugify } from "./utils";
import { movePath, pagePath } from "./page-links";
import { relinkSite } from "./relink";

/**
 * The most old addresses one page keeps. Past this the oldest goes: a page
 * renamed that often is being experimented with, and the addresses from
 * before the experiments are the ones least likely to be anyone's bookmark.
 */
export const MAX_REDIRECTS_PER_PAGE = 20;

/**
 * `wanted` as a slug no other page of the site is using: the slug itself,
 * or the same with `-1`, `-2` and so on after it.
 */
export async function freePageSlug(siteId: string, wanted: string, pageId?: string): Promise<string> {
  const base = slugify(wanted);
  let slug = base;
  for (let suffix = 1; ; suffix += 1) {
    const existing = await prisma.page.findUnique({
      where: { siteId_slug: { siteId, slug } },
      select: { id: true },
    });
    if (!existing || existing.id === pageId) return slug;
    slug = `${base}-${suffix}`;
  }
}

export interface RenamedPage {
  id: string;
  siteId: string;
  /** The slug before the rename. */
  slug: string;
  isHome: boolean;
  /** Whether the page was published under the old slug. */
  published: boolean;
}

/**
 * What follows a page's slug changing from `before.slug` to `slug`, once the
 * row itself has been written: the old address kept as a redirect, any
 * redirect from the new address dropped (the address is a page now), and
 * every link in the site moved across. Returns how many links moved.
 *
 * A home page is addressed as the bare site URL, so renaming its slug moves
 * no link and leaves no address behind.
 */
export async function afterRename(before: RenamedPage, slug: string): Promise<number> {
  if (slug === before.slug) return 0;

  // Whatever pointed here from an old address pointed at a page that no
  // longer existed; the address belongs to this page now.
  await prisma.pageRedirect.deleteMany({ where: { siteId: before.siteId, fromSlug: slug } });
  if (before.isHome) return 0;

  if (before.published) {
    await prisma.pageRedirect.upsert({
      where: { siteId_fromSlug: { siteId: before.siteId, fromSlug: before.slug } },
      update: { pageId: before.id },
      create: { siteId: before.siteId, fromSlug: before.slug, pageId: before.id },
    });
    const kept = await prisma.pageRedirect.findMany({
      where: { pageId: before.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const stale = kept.slice(MAX_REDIRECTS_PER_PAGE).map((r) => r.id);
    if (stale.length) await prisma.pageRedirect.deleteMany({ where: { id: { in: stale } } });
  }

  const site = await prisma.site.findUnique({ where: { id: before.siteId }, select: { slug: true } });
  if (!site) return 0;
  return relinkSite(before.siteId, movePath(pagePath(site.slug, before.slug, false), pagePath(site.slug, slug, false)));
}

/**
 * A page's old addresses, newest first, as the settings panel lists them.
 *
 * Less any another page has taken since. A page made, imported or put back
 * from the trash under an old address is the one a visitor finds there — the
 * published route looks for a page before it looks for a forward — so the
 * address is not listed as forwarding here when it does not.
 */
export async function formerSlugs(pageId: string): Promise<string[]> {
  const rows = await prisma.pageRedirect.findMany({
    where: { pageId },
    orderBy: { createdAt: "desc" },
    select: { fromSlug: true, siteId: true },
  });
  if (rows.length === 0) return [];
  const held = await prisma.page.findMany({
    where: { siteId: rows[0].siteId, slug: { in: rows.map((r) => r.fromSlug) } },
    select: { slug: true },
  });
  const taken = new Set(held.map((p) => p.slug));
  return rows.map((r) => r.fromSlug).filter((slug) => !taken.has(slug));
}
