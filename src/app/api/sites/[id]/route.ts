import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { moveSite } from "@/lib/page-links";
import { relinkSite } from "@/lib/relink";
import { trashSite, siteDeletionCost } from "@/lib/trash";
import { normalizeSiteFields } from "@/lib/site-fields";
import { readJsonObject } from "@/lib/request-body";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: Params) {
  // ?cost=1 answers "what exactly would deleting this take with it", which the
  // confirmation asks before anyone presses the button.
  if (new URL(req.url).searchParams.get("cost") === "1") {
    const site = await prisma.site.findUnique({ where: { id: params.id }, select: { name: true } });
    if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ name: site.name, ...(await siteDeletionCost(params.id)) });
  }

  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: { pages: { orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }, { updatedAt: "desc" }] } },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(site);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  // One description of what a site's settings may be, shared with import,
  // trash restore and the MCP server — the four used to disagree, and import
  // was the one that checked nothing.
  const data: Record<string, unknown> = normalizeSiteFields(body);

  if (typeof body.slug === "string" && body.slug.trim()) {
    let newSlug = slugify(body.slug);
    let suffix = 0;
    const base = newSlug;
    while (true) {
      const existing = await prisma.site.findUnique({ where: { slug: newSlug } });
      if (!existing || existing.id === params.id) break;
      suffix += 1;
      newSlug = `${base}-${suffix}`;
    }
    data.slug = newSlug;
  }
  const before = await prisma.site.findUnique({ where: { id: params.id }, select: { slug: true } });
  const site = await prisma.site.update({ where: { id: params.id }, data });

  // Renaming a site moves every page in it. The links between those pages are
  // written as full paths, so without this they all still point into the
  // address the site used to have — which after the rename is nobody's.
  let relinked = 0;
  if (before && site.slug !== before.slug) {
    relinked = await relinkSite(site.id, moveSite(before.slug, site.slug));
  }

  return NextResponse.json(relinked ? { ...site, relinked } : site);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  // Into the trash, whole, rather than gone. It can be put back from there.
  // ?permanent=1 skips that, for a caller that has already made its mind up.
  if (new URL(req.url).searchParams.get("permanent") === "1") {
    await prisma.site.delete({ where: { id: params.id } }).catch(() => null);
    return NextResponse.json({ ok: true, trashed: false });
  }
  if (!(await trashSite(params.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, trashed: true });
}
