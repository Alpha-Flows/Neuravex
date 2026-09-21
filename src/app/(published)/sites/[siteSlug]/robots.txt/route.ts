import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/self-origin";
import { robotsTxt } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** GET /sites/[siteSlug]/robots.txt — what a crawler may read, and the sitemap. */
export async function GET(req: NextRequest, { params }: { params: { siteSlug: string } }) {
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: { slug: true, _count: { select: { pages: { where: { published: true } } } } },
  });
  if (!site) return new NextResponse("Not found", { status: 404 });

  // The address crawlers see, which only the operator knows. This used to
  // take its scheme from `X-Forwarded-Proto`, so behind the documented proxy
  // the sitemap advertised `https://localhost:3939/…`.
  const origin = publicOrigin(req.headers);
  return new NextResponse(robotsTxt(site._count.pages > 0, `${origin}/sites/${site.slug}/sitemap.xml`), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
