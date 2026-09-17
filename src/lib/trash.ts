/**
 * Deleting, with a way back.
 *
 * Deleting used to be final: a site took its pages, their history and every
 * form submission with it, behind one browser confirm(). Now the thing is
 * written whole into the trash first, and putting it back rebuilds it from
 * there — the same archive format the JSON export uses.
 */

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { freePageSlug, freeSiteSlug } from "@/lib/restore";
import {
  serializeSite,
  serializePage,
  siteCreateData,
  pageCreateData,
  isSiteArchive,
  PageArchive,
} from "@/lib/site-archive";

/**
 * How many deleted things are kept. Old entries carry whole sites, so an
 * unbounded trash would quietly grow the database forever on a machine where
 * nobody ever empties it.
 */
export const TRASH_LIMIT = 50;

/** Drop the oldest entries once the trash is over its limit. */
async function trimTrash(): Promise<void> {
  const excess = await prisma.trashItem.findMany({
    orderBy: { deletedAt: "desc" },
    skip: TRASH_LIMIT,
    select: { id: true },
  });
  if (excess.length > 0) {
    await prisma.trashItem.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
  }
}

/** What a deletion takes with it, for the confirmation that precedes it. */
export interface DeletionCost {
  pages: number;
  revisions: number;
  submissions: number;
}

export async function siteDeletionCost(siteId: string): Promise<DeletionCost> {
  const pages = await prisma.page.findMany({ where: { siteId }, select: { id: true } });
  const ids = pages.map((p) => p.id);
  const [revisions, submissions] = await Promise.all([
    prisma.revision.count({ where: { pageId: { in: ids } } }),
    prisma.submission.count({ where: { pageId: { in: ids } } }),
  ]);
  return { pages: pages.length, revisions, submissions };
}

export async function pageDeletionCost(pageId: string): Promise<DeletionCost> {
  const [revisions, submissions] = await Promise.all([
    prisma.revision.count({ where: { pageId } }),
    prisma.submission.count({ where: { pageId } }),
  ]);
  return { pages: 1, revisions, submissions };
}

/** Move a whole site into the trash, then remove it. */
export async function trashSite(siteId: string): Promise<boolean> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
        include: { revisions: true, submissions: true },
      },
    },
  });
  if (!site) return false;

  await prisma.trashItem.create({
    data: {
      kind: "site",
      label: site.name,
      payload: JSON.stringify(serializeSite(site, { includeHistory: true })),
    },
  });
  await prisma.site.delete({ where: { id: siteId } });
  await trimTrash();
  return true;
}

/** The same for one page, remembering which site to offer it back to. */
export async function trashPage(pageId: string): Promise<boolean> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { revisions: true, submissions: true, site: { select: { id: true, name: true } } },
  });
  if (!page) return false;

  await prisma.trashItem.create({
    data: {
      kind: "page",
      label: page.title,
      siteId: page.site.id,
      siteName: page.site.name,
      payload: JSON.stringify(serializePage(page, { includeHistory: true })),
    },
  });
  await prisma.page.delete({ where: { id: pageId } });
  await trimTrash();
  return true;
}

interface TrashRow {
  id: string;
  kind: string;
  label: string;
  siteId: string | null;
  payload: string;
}

/** Rebuild whatever this was. Throws with a reason a person can read. */
export async function restoreTrashItem(item: TrashRow): Promise<{ kind: string; id: string }> {
  const payload = JSON.parse(item.payload);

  if (item.kind === "site") {
    if (!isSiteArchive(payload)) throw new Error("This entry is damaged and cannot be restored.");
    const site = await prisma.site.create({
      data: {
        ...siteCreateData(payload),
        slug: await freeSiteSlug(slugify(String(payload.site.slug || payload.site.name))),
      },
    });
    for (const page of payload.pages) {
      await restorePage(site.id, page);
    }
    return { kind: "site", id: site.id };
  }

  if (!item.siteId) throw new Error("The site this page belonged to is gone.");
  const site = await prisma.site.findUnique({ where: { id: item.siteId }, select: { id: true } });
  if (!site) {
    throw new Error("The site this page belonged to has been deleted. Restore the site instead.");
  }
  const page = await restorePage(site.id, payload as PageArchive);
  return { kind: "page", id: page.id };
}

/** One page and everything under it, into a site that exists. */
async function restorePage(siteId: string, archive: PageArchive) {
  const data = pageCreateData(archive);
  const page = await prisma.page.create({
    data: {
      ...data,
      siteId,
      slug: await freePageSlug(siteId, slugify(data.slug)),
      // Two home pages would leave the site with an ambiguous front door.
      isHome: data.isHome
        ? (await prisma.page.count({ where: { siteId, isHome: true } })) === 0
        : false,
    },
  });

  const revisions = archive.revisions ?? [];
  if (revisions.length > 0) {
    await prisma.revision.createMany({
      data: revisions.map((r) => ({
        pageId: page.id,
        title: r.title,
        content: r.content,
        manual: r.manual,
        createdAt: new Date(r.createdAt),
      })),
    });
  }

  const submissions = archive.submissions ?? [];
  if (submissions.length > 0) {
    await prisma.submission.createMany({
      data: submissions.map((s) => ({
        pageId: page.id,
        data: s.data,
        createdAt: new Date(s.createdAt),
      })),
    });
  }

  return page;
}
