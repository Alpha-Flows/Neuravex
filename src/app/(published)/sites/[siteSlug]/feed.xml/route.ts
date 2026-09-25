import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/self-origin";
import { postItems } from "@/lib/posts";
import { atomFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

/**
 * GET /sites/[siteSlug]/feed.xml — the site's published posts as an Atom
 * feed, newest first; see `lib/feed.ts`. Addresses are absolute here, where
 * the server knows its own; the download writes them relative.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ siteSlug: string }> }) {
  const params = await props.params;
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      pages: {
        where: { published: true, isPost: true },
        select: { id: true, slug: true, title: true, isHome: true, isPost: true, postDate: true, author: true, excerpt: true, coverImage: true, tags: true, createdAt: true },
      },
    },
  });
  if (!site) return new NextResponse("Not found", { status: 404 });

  const origin = publicOrigin(req.headers).replace(/\/+$/, "");
  const xml = atomFeed({
    siteId: site.id,
    siteName: site.name,
    homeHref: `${origin}/sites/${site.slug}`,
    selfHref: `${origin}/sites/${site.slug}/feed.xml`,
    hrefOf: (post) => `${origin}${post.href}`,
    posts: postItems(site.pages, site.slug),
  });
  return new NextResponse(xml, { headers: { "content-type": "application/atom+xml; charset=utf-8" } });
}
