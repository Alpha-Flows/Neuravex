import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { resolveSiteToken } from "@/lib/page-links";
import { getTemplate, resolveSiteAccent } from "@/lib/templates";

export const dynamic = "force-dynamic";

// List all sites
export async function GET() {
  const sites = await prisma.site.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { pages: true } } },
  });
  return NextResponse.json(sites);
}

// Create a new site, optionally seeded from a template
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name: string = (body.name || "Untitled site").toString().trim();
  let slug = slugify(name);
  const description: string | null = body.description ? String(body.description) : null;
  const templateId: string | null = body.templateId ? String(body.templateId) : null;
  const tpl = templateId ? getTemplate(templateId) : null;
  const accent = resolveSiteAccent(body.accent ? String(body.accent) : null, tpl);

  // Ensure unique slug
  let suffix = 0;
  const base = slug;
  while (await prisma.site.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  const site = await prisma.site.create({
    data: { name, slug, description, accent },
  });

  if (tpl) {
    for (let i = 0; i < tpl.pages.length; i++) {
      const page = tpl.pages[i];
      await prisma.page.create({
        data: {
          siteId: site.id,
          title: page.title,
          slug: page.slug,
          isHome: !!page.isHome,
          published: page.published !== false,
          sortOrder: i,
          // A template links between its own pages with a stand-in for the
          // site address, which only exists now that the site does.
          content: resolveSiteToken(JSON.stringify(page.blocks), slug),
        },
      });
    }
  } else {
    // Create a default home page so the editor isn't empty
    await prisma.page.create({
      data: {
        siteId: site.id,
        title: "Home",
        slug: "index",
        isHome: true,
        published: false,
        sortOrder: 0,
        content: "[]",
      },
    });
  }

  return NextResponse.json(site, { status: 201 });
}
