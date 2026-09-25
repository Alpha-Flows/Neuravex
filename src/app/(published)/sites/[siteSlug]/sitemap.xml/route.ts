import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/self-origin";
import { pageUrl, sitemapXml } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * GET /sites/[siteSlug]/sitemap.xml — every published page of one site.
 *
 * A sitemap is the first thing a search engine looks for and the app had
 * none, so a published site's inner pages were found only by crawling links
 * from the home page, if at all.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ siteSlug: string }> }) {
  const params = await props.params;
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    include: {
      pages: {
        // The "not found" page is what a missing address shows, not a page
        // of the site to be indexed on its own.
        where: { published: true, isNotFound: false },
        orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }],
        select: { slug: true, isHome: true, updatedAt: true },
      },
    },
  });
  if (!site) return new NextResponse("Not found", { status: 404 });

  // The address crawlers see, which only the operator knows. This used to
  // take its scheme from `X-Forwarded-Proto`, so behind the documented proxy
  // the sitemap advertised `https://localhost:3939/…`.
  const origin = publicOrigin(req.headers);
  const xml = sitemapXml(
    site.pages.map((p) => ({
      loc: pageUrl(origin, site.slug, p.slug, p.isHome),
      lastmod: p.updatedAt,
      priority: p.isHome ? "1.0" : "0.7",
    })),
  );

  return new NextResponse(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
