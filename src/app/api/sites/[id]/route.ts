import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { trashSite, siteDeletionCost } from "@/lib/trash";

export const dynamic = "force-dynamic";

const HEADER_SHAPES = new Set(["bar", "rounded", "pill"]);
const HEADER_POSITIONS = new Set(["static", "sticky", "fixed"]);

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
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null) data.description = body.description;
  if (typeof body.accent === "string") data.accent = body.accent;
  // Theme / layout / SEO fields
  if (typeof body.fontFamily === "string" || body.fontFamily === null) data.fontFamily = body.fontFamily;
  if (typeof body.headingFont === "string" || body.headingFont === null) data.headingFont = body.headingFont;
  if (typeof body.borderRadius === "string" || body.borderRadius === null) data.borderRadius = body.borderRadius;
  if (typeof body.headerHtml === "string" || body.headerHtml === null) data.headerHtml = body.headerHtml;
  if (typeof body.footerHtml === "string" || body.footerHtml === null) data.footerHtml = body.footerHtml;
  if (typeof body.headerBackground === "string") data.headerBackground = body.headerBackground;
  if (typeof body.headerOpacity === "number" && Number.isFinite(body.headerOpacity)) {
    data.headerOpacity = Math.max(0, Math.min(100, Math.round(body.headerOpacity)));
  }
  if (typeof body.headerShape === "string" && HEADER_SHAPES.has(body.headerShape)) data.headerShape = body.headerShape;
  if (typeof body.headerPosition === "string" && HEADER_POSITIONS.has(body.headerPosition)) data.headerPosition = body.headerPosition;
  if (typeof body.customCss === "string" || body.customCss === null) data.customCss = body.customCss;
  if (typeof body.metaTitle === "string" || body.metaTitle === null) data.metaTitle = body.metaTitle;
  if (typeof body.metaDescription === "string" || body.metaDescription === null) data.metaDescription = body.metaDescription;
  if (typeof body.ogImage === "string" || body.ogImage === null) data.ogImage = body.ogImage;
  if (typeof body.favicon === "string" || body.favicon === null) data.favicon = body.favicon;
  // A BCP 47 tag, loosely: letters and dashes, which is what <html lang> takes.
  if (typeof body.language === "string" && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(body.language.trim())) {
    data.language = body.language.trim();
  }
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
  const site = await prisma.site.update({ where: { id: params.id }, data });
  return NextResponse.json(site);
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
