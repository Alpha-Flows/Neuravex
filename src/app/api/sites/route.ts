import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { resolveSiteToken } from "@/lib/page-links";
import { getTemplate, resolveSiteAccent } from "@/lib/templates";
import { normalizeSiteFields } from "@/lib/site-fields";
import { readJsonObject } from "@/lib/request-body";
import { normalizeBlockTreeJson } from "@/lib/block-tree";

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
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const fields = normalizeSiteFields(body);
  const name = String(fields.name ?? "Untitled site");
  let slug = slugify(name) || "site";
  const description = (fields.description as string | null) ?? null;
  const templateId: string | null = typeof body.templateId === "string" ? body.templateId : null;
  const tpl = templateId ? getTemplate(templateId) : null;
  // `resolveSiteAccent` used to hand the request straight back; it now checks
  // the colour, and `fields.accent` has already been through the same test.
  const accent = resolveSiteAccent(typeof body.accent === "string" ? body.accent : null, tpl);

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
          content: resolveSiteToken(templateContent(page.blocks), slug),
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

/**
 * A template's blocks, through the same validator every other write uses.
 *
 * The bundled templates are ours, so this is not a trust boundary — it is the
 * one place that would otherwise let a tree into the database without having
 * been normalised, and a template that stopped matching the schema should
 * fail here rather than in somebody's editor.
 */
function templateContent(blocks: unknown): string {
  const tree = normalizeBlockTreeJson(blocks);
  return tree.ok ? tree.json : "[]";
}
