import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/export — download full site as JSON
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: { pages: { orderBy: { sortOrder: "asc" } } },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    site: {
      name: site.name,
      slug: site.slug,
      description: site.description,
      accent: site.accent,
      theme: site.theme,
      fontFamily: site.fontFamily,
      headingFont: site.headingFont,
      borderRadius: site.borderRadius,
      headerHtml: site.headerHtml,
      footerHtml: site.footerHtml,
      customCss: site.customCss,
      metaTitle: site.metaTitle,
      metaDescription: site.metaDescription,
    },
    pages: site.pages.map((p) => ({
      title: p.title,
      slug: p.slug,
      isHome: p.isHome,
      published: p.published,
      sortOrder: p.sortOrder,
      content: p.content,
    })),
  };

  return NextResponse.json(data, {
    headers: { "content-disposition": `attachment; filename="${site.slug}.json"` },
  });
}
