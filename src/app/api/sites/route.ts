import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { getTemplate } from "@/lib/templates";

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
  const accent: string = body.accent ? String(body.accent) : "#6366f1";
  const theme: string = body.theme ? String(body.theme) : "light";

  // Ensure unique slug
  let suffix = 0;
  const base = slug;
  while (await prisma.site.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  const site = await prisma.site.create({
    data: { name, slug, description, accent, theme },
  });

  if (templateId) {
    const tpl = getTemplate(templateId);
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
            content: JSON.stringify(page.blocks),
          },
        });
      }
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
