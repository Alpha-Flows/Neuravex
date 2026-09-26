import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trashPage, pageDeletionCost } from "@/lib/trash";
import { afterRename, freePageSlug } from "@/lib/page-rename";
import { versionOf } from "@/lib/page-version";
import { normalizeBlockTreeJson, clampSortOrder } from "@/lib/block-tree";
import { readJsonObject } from "@/lib/request-body";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // ?cost=1 — what deleting this page would take with it.
  if (new URL(req.url).searchParams.get("cost") === "1") {
    return NextResponse.json({ title: page.title, ...(await pageDeletionCost(params.id)) });
  }
  // ?version=1 — only which version the page is at, which an open editor
  // asks when it comes back into view; see `lib/page-version`.
  if (new URL(req.url).searchParams.get("version") === "1") {
    return NextResponse.json({ version: versionOf(page) });
  }
  return NextResponse.json({ ...page, version: versionOf(page) });
}

export async function PATCH(req: NextRequest, props: Params) {
  const params = await props.params;
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
    data.slug = await freePageSlug(page.siteId, body.slug, page.id);
  }

  const updated = await prisma.page.update({ where: { id: params.id }, data });

  // A renamed page takes its links with it. Changing an address used to leave
  // every link written to the old one pointing at a 404, silently and site-
  // wide — the nav was rebuilt from the pages so it survived, and nothing an
  // author had typed by hand did. The old address is kept forwarding, too,
  // for the links nobody here can rewrite; see `afterRename`.
  const relinked = typeof data.slug === "string" ? await afterRename(page, data.slug) : 0;

  return NextResponse.json(relinked ? { ...updated, relinked } : updated);
}

export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  if (new URL(req.url).searchParams.get("permanent") === "1") {
    await prisma.page.delete({ where: { id: params.id } }).catch(() => null);
    return NextResponse.json({ ok: true, trashed: false });
  }
  if (!(await trashPage(params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, trashed: true });
}
