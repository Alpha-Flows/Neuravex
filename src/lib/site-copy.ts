/**
 * A new site made from an existing one: a copy of a site, or a site made from
 * a template somebody saved.
 *
 * Only pages could be duplicated. Starting a second site that looked like the
 * first — a sister shop, next year's event, a client's site built from the
 * last client's — meant exporting the JSON, importing it again and renaming
 * the result, and even then every link inside it still pointed at the first
 * site's address: `/sites/bakery/contact` in a button on the copy of the
 * bakery sent visitors back to the original.
 *
 * Both go through the archive, the one description of a whole site that the
 * export, the import and the trash already share, so nothing a site carries is
 * left behind — its settings, its menu and footer, every page and what is on
 * it. History and form submissions are not copied: they belong to the site
 * they happened on. Afterwards every link into the old address is moved to
 * the new one, by the same sweep a rename uses.
 */
import { prisma } from "./prisma";
import { slugify } from "./utils";
import { freeSiteSlug } from "./restore";
import { normalizeArchivePages, serializeSite, siteCreateData, type SiteArchive } from "./site-archive";
import { relinkSite } from "./relink";
import { moveSite } from "./page-links";

/**
 * A site made from an archive, under the given name, at the first free
 * address like it; links that pointed at `fromSlug` are moved to it.
 * `keepAddress` keeps the address the site will be hosted at, for a backup
 * being put back rather than a site being started from another; `slug` is
 * the address wanted in the builder, when it is not the one the name gives.
 */
export async function createSiteFromArchive(
  archive: SiteArchive,
  {
    name,
    fromSlug,
    keepAddress = false,
    slug,
  }: { name: string; fromSlug?: string; keepAddress?: boolean; slug?: string },
): Promise<{ id: string; slug: string; name: string }> {
  const site = await prisma.site.create({
    data: {
      ...siteCreateData(archive),
      // A copy or a site made from a template is a new site, which is not
      // going to live where the one it came from does; a backup put back is
      // the same site, and is.
      ...(keepAddress ? {} : { siteUrl: null }),
      name,
      slug: await freeSiteSlug(slugify(slug || name) || "site"),
      pages: { create: normalizeArchivePages(archive.pages) },
    },
    select: { id: true, slug: true, name: true },
  });
  if (fromSlug && fromSlug !== site.slug) await relinkSite(site.id, moveSite(fromSlug, site.slug));
  return site;
}

/** The site as an archive, without its history — what a copy or a template starts from. */
export async function archiveOf(siteId: string): Promise<SiteArchive | null> {
  const site = await prisma.site.findUnique({ where: { id: siteId }, include: { pages: true } });
  return site ? serializeSite(site) : null;
}

/** A copy of a site, called "<name> (copy)", or null when there is no such site. */
export async function duplicateSite(siteId: string): Promise<{ id: string; slug: string; name: string } | null> {
  const archive = await archiveOf(siteId);
  if (!archive) return null;
  const name = `${String(archive.site.name ?? "Untitled site")} (copy)`.slice(0, 300);
  return createSiteFromArchive(archive, { name, fromSlug: String(archive.site.slug ?? "") });
}
