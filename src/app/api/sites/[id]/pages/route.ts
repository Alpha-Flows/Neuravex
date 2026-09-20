import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { startingContent } from "@/lib/page-starters";

export const dynamic = "force-dynamic";

// /api/sites/:id/pages
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const includeUnpublished = searchParams.get("all") === "1";
  // Same order the site admin and the published nav use, so a page sits in
  // the same place everywhere it is listed.
  const pages = await prisma.page.findMany({
    where: { siteId: params.id, ...(includeUnpublished ? {} : { published: true }) },
    orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json(pages);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const title: string = (body.title || "Untitled page").toString().trim();
  let slug = slugify(body.slug || title);

  let suffix = 0;
  const base = slug;
  while (await prisma.page.findUnique({ where: { siteId_slug: { siteId: params.id, slug } } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  const maxOrder = await prisma.page.findFirst({
    where: { siteId: params.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  /**
   * What the page opens on.
   *
   * Content handed in wins — that is a duplicate, an import or an agent
   * writing a page it has already composed. Otherwise the page is built from
   * a starter, drawn in the look read off the site's existing pages, so a new
   * page arrives dressed like the site it was made in instead of as the bare
   * `[]` it used to be.
   */
  let content: string;
  if (typeof body.content === "string") {
    content = body.content;
  } else {
    const siblings = await prisma.page.findMany({
      where: { siteId: params.id },
      select: { content: true },
    });
    content = startingContent(body.starter, siblings.map((p) => p.content), title);
  }

  const page = await prisma.page.create({
    data: {
      siteId: params.id,
      title,
      slug,
      isHome: false,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      content,
    },
  });
  return NextResponse.json(page, { status: 201 });
}
