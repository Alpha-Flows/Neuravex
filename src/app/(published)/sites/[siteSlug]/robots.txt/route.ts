import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { robotsTxt } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** GET /sites/[siteSlug]/robots.txt — what a crawler may read, and the sitemap. */
export async function GET(req: NextRequest, { params }: { params: { siteSlug: string } }) {
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: { slug: true, _count: { select: { pages: { where: { published: true } } } } },
  });
  if (!site) return new NextResponse("Not found", { status: 404 });

  const origin = new URL(req.url).origin;
  return new NextResponse(robotsTxt(site._count.pages > 0, `${origin}/sites/${site.slug}/sitemap.xml`), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
