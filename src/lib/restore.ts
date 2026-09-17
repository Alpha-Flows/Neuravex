import { prisma } from "@/lib/prisma";

/**
 * A slug nobody is using, starting from the one asked for.
 *
 * Restoring from the trash or importing a copy usually finds its own address
 * free — the site that held it is gone. When it is not, the copy is numbered
 * rather than refused.
 */
export async function freeSiteSlug(wanted: string): Promise<string> {
  const base = wanted || "site";
  let slug = base;
  let suffix = 0;
  while (await prisma.site.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

/** The same, for a page inside one site. */
export async function freePageSlug(siteId: string, wanted: string): Promise<string> {
  const base = wanted || "page";
  let slug = base;
  let suffix = 0;
  while (await prisma.page.findUnique({ where: { siteId_slug: { siteId, slug } } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}
