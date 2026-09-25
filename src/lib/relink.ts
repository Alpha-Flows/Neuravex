/**
 * Applying a link rewrite across everything in a site that can hold one.
 *
 * Renaming a page, or the site itself, changes an address that other pages
 * have written down. The nav is rebuilt from the pages each time so it never
 * noticed; every link an author typed by hand did, and became a 404 without
 * saying so. This is the sweep that keeps them pointing at the right page —
 * the block trees of every page, and the site's own custom header and footer
 * HTML, which is the other place a path gets typed.
 *
 * It lives apart from `page-links` because it talks to the database, and
 * `page-links` is imported by the editor, where a Prisma client cannot go.
 */

import { prisma } from "./prisma";
import { LinkMapper, retargetHref, retargetHtmlLinks, retargetLinksInContent } from "./page-links";
import { normalizeMenu, retargetMenu } from "./menu";
import { normalizeFooter, retargetFooter } from "./footer";

/** Rewrites every link in the site and returns how many moved. */
export async function relinkSite(siteId: string, map: LinkMapper): Promise<number> {
  let moved = 0;

  const pages = await prisma.page.findMany({ where: { siteId }, select: { id: true, content: true } });
  for (const page of pages) {
    const { content, changed } = retargetLinksInContent(page.content, map);
    if (!changed) continue;
    await prisma.page.update({ where: { id: page.id }, data: { content } });
    moved += changed;
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { headerHtml: true, footerHtml: true, menu: true, footer: true },
  });
  if (!site) return moved;

  const chrome: Record<string, string> = {};
  for (const key of ["headerHtml", "footerHtml"] as const) {
    const html = site[key];
    if (!html) continue;
    const next = retargetHtmlLinks(html, map);
    if (next !== html) {
      chrome[key] = next;
      moved += 1;
    }
  }
  // The menu's links and the laid-out footer's are typed addresses too. The
  // menu's pages are named by id and need nothing.
  const follow = (href: string) => retargetHref(href, map);
  if (site.menu) {
    const next = JSON.stringify(retargetMenu(site.menu, follow));
    if (next !== JSON.stringify(normalizeMenu(site.menu))) {
      chrome.menu = next;
      moved += 1;
    }
  }
  if (site.footer) {
    const next = retargetFooter(site.footer, follow);
    if (next && JSON.stringify(next) !== JSON.stringify(normalizeFooter(site.footer))) {
      chrome.footer = JSON.stringify(next);
      moved += 1;
    }
  }
  if (Object.keys(chrome).length) await prisma.site.update({ where: { id: siteId }, data: chrome });

  return moved;
}
