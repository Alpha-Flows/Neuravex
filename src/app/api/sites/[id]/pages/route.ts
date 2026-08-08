import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

// /api/sites/:id/pages
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const includeUnpublished = searchParams.get("all") === "1";
  const pages = await prisma.page.findMany({
    where: { siteId: params.id, ...(includeUnpublished ? {} : { published: true }) },
    orderBy: { updatedAt: "desc" },
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

  const page = await prisma.page.create({
    data: {
      siteId: params.id,
      title,
      slug,
      isHome: false,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      content: typeof body.content === "string" ? body.content : "[]",
    },
  });
  return NextResponse.json(page, { status: 201 });
}
