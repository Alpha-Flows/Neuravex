import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { trashPage, pageDeletionCost } from "@/lib/trash";

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
  const body = await req.json().catch(() => ({}));
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
  if (typeof body.content === "string") data.content = body.content;
  if (typeof body.sortOrder === "number") {
    data.sortOrder = body.sortOrder;
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
  return NextResponse.json(updated);
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
