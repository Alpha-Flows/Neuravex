import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { trashPage, pageDeletionCost } from "@/lib/trash";
import { movePath, pagePath } from "@/lib/page-links";
import { relinkSite } from "@/lib/relink";
import { normalizeBlockTreeJson, clampSortOrder } from "@/lib/block-tree";
import { readJsonObject } from "@/lib/request-body";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: Params) {
  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // ?cost=1 — what deleting this page would take with it.
  if (new URL(req.url).searchParams.get("cost") === "1") {
    return NextResponse.json({ title: page.title, ...(await pageDeletionCost(params.id)) });
  }
  return NextResponse.json(page);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, any>;

  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.published === "boolean") data.published = body.published;
  if (typeof body.isHome === "boolean") {
    data.isHome = body.isHome;
    if (body.isHome) {
      await prisma.page.updateMany({
        where: { siteId: page.siteId, id: { not: page.id }, isHome: true },
        data: { isHome: false },
      });
    }
  }
  if (typeof body.content === "string") {
    const tree = normalizeBlockTreeJson(body.content);
    if (!tree.ok) return NextResponse.json({ error: tree.error }, { status: 400 });
    data.content = tree.json;
  }
  if (typeof body.sortOrder === "number") {
    // `sortOrder` is a 32-bit column. SQLite stored 1e12 without complaint,
    // and every later Prisma read of that row threw — the public site, the
    // pages list and the download all answered 500 until somebody opened the
    // database by hand.
    const order = clampSortOrder(body.sortOrder);
    if (order === undefined) {
      return NextResponse.json({ error: "sortOrder has to be a number." }, { status: 400 });
    }
    data.sortOrder = order;
  } else if (body.sortOrder === "increment" || body.sortOrder === "decrement") {
    const dir = body.sortOrder === "increment" ? 1 : -1;
    const neighbor = await prisma.page.findFirst({
      where: {
        siteId: page.siteId,
        sortOrder: dir > 0 ? { gt: page.sortOrder } : { lt: page.sortOrder },
        id: { not: page.id },
      },
      orderBy: { sortOrder: dir > 0 ? "asc" : "desc" },
    });
    if (neighbor) {
      await prisma.page.update({ where: { id: neighbor.id }, data: { sortOrder: page.sortOrder } });
      data.sortOrder = neighbor.sortOrder;
    }
  }

  if (typeof body.slug === "string" && body.slug.trim()) {
    let newSlug = slugify(body.slug);
    let suffix = 0;
    const base = newSlug;
    while (true) {
      const existing = await prisma.page.findUnique({
        where: { siteId_slug: { siteId: page.siteId, slug: newSlug } },
      });
      if (!existing || existing.id === params.id) break;
      suffix += 1;
      newSlug = `${base}-${suffix}`;
    }
    data.slug = newSlug;
  }

  const updated = await prisma.page.update({ where: { id: params.id }, data });

  // A renamed page takes its links with it. Changing an address used to leave
  // every link written to the old one pointing at a 404, silently and site-
  // wide — the nav was rebuilt from the pages so it survived, and nothing an
  // author had typed by hand did.
  let relinked = 0;
  if (typeof data.slug === "string" && data.slug !== page.slug) {
    relinked = await retargetSiteLinks(page.siteId, page.slug, updated.slug, updated.isHome);
  }

  return NextResponse.json(relinked ? { ...updated, relinked } : updated);
}

/**
 * Move every link in a site from a page's old address to its new one, and say
 * how many moved.
 *
 * A home page is addressed as the bare site URL, so renaming its slug moves
 * nothing — there was no old address to leave behind.
 */
async function retargetSiteLinks(
  siteId: string,
  oldSlug: string,
  newSlug: string,
  isHome: boolean,
): Promise<number> {
  if (isHome) return 0;
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { slug: true } });
  if (!site) return 0;
  return relinkSite(siteId, movePath(pagePath(site.slug, oldSlug, false), pagePath(site.slug, newSlug, false)));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (new URL(req.url).searchParams.get("permanent") === "1") {
    await prisma.page.delete({ where: { id: params.id } }).catch(() => null);
    return NextResponse.json({ ok: true, trashed: false });
  }
  if (!(await trashPage(params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, trashed: true });
}
