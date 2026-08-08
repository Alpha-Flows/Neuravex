import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

// POST /api/sites/import — import a site from JSON
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.site?.name || !Array.isArray(body.pages)) {
    return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  }

  let slug = slugify(body.site.name);
  let suffix = 0;
  const base = slug;
  while (await prisma.site.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  const site = await prisma.site.create({
    data: {
      name: body.site.name ,
      slug,
      description: body.site.description ?? null,
      accent: body.site.accent ?? "#6366f1",
      theme: body.site.theme ?? "light",
      fontFamily: body.site.fontFamily ?? null,
      headingFont: body.site.headingFont ?? null,
      borderRadius: body.site.borderRadius ?? null,
      headerHtml: body.site.headerHtml ?? null,
      footerHtml: body.site.footerHtml ?? null,
      customCss: body.site.customCss ?? null,
      metaTitle: body.site.metaTitle ?? null,
      metaDescription: body.site.metaDescription ?? null,
      pages: {
        create: body.pages.map((p: any) => ({
          title: p.title ?? "Untitled",
          slug: p.slug ?? "page",
          isHome: !!p.isHome,
          published: !!p.published,
          sortOrder: p.sortOrder ?? 0,
          content: p.content ?? "[]",
        })),
      },
    },
  });

  return NextResponse.json(site, { status: 201 });
}
