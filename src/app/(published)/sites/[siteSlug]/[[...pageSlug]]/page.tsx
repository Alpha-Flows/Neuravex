import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BaseBlock } from "@/types";
import { PublicBlocks } from "@/components/public/PublicBlocks";
import type { Metadata } from "next";
import { sanitizeCss } from "@/lib/security";
import { siteThemeCss, headerOffset } from "@/lib/site-theme";
import { pageUrl } from "@/lib/seo";
import { SiteHeader, SiteFooter } from "@/components/public/SiteChrome";

export const dynamic = "force-dynamic";

interface Props {
  params: { siteSlug: string; pageSlug?: string[] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await prisma.site.findUnique({ where: { slug: params.siteSlug } });
  if (!site) return {};
  const pageSlug = params.pageSlug?.join("/");
  const pages = await prisma.page.findMany({
    where: { siteId: site.id, published: true },
    orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
  });
  const page = pageSlug ? pages.find((p) => p.slug === pageSlug) : pages.find((p) => p.isHome) ?? pages[0];
  const title = page?.metaTitle || site.metaTitle || page?.title || site.name;
  const desc = page?.metaDescription || site.metaDescription || site.description || undefined;
  const og = page?.ogImage || site.ogImage || undefined;

  // A canonical address, so the home page reached at /sites/x and
  // /sites/x/index is not counted as two pages with the same content.
  const canonical = page ? pageUrl("", site.slug, page.slug, page.isHome) : undefined;

  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "website", ...(og ? { images: [og] } : {}) },
    alternates: canonical ? { canonical } : undefined,
    icons: site.favicon ? { icon: site.favicon } : undefined,
  };
}

export default async function PublicSitePage({ params }: Props) {
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    include: { pages: { where: { published: true }, orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }] } },
  });
  if (!site) notFound();

  const pageSlug = params.pageSlug?.join("/");
  const page = pageSlug
    ? site.pages.find((p) => p.slug === pageSlug)
    : site.pages.find((p) => p.isHome) ?? site.pages[0];
  if (!page) notFound();

  let blocks: BaseBlock[] = [];
  try {
    const parsed = JSON.parse(page.content || "[]");
    if (Array.isArray(parsed)) blocks = parsed as BaseBlock[];
  } catch {
    blocks = [];
  }

  return (
    <>
      {/* The site's branding, which every block without a colour of its own
          reads. Always emitted: a block's fallback is the accent, not a hex. */}
      <style dangerouslySetInnerHTML={{ __html: siteThemeCss(site) }} />
      {site.customCss ? <style dangerouslySetInnerHTML={{ __html: sanitizeCss(site.customCss) }} /> : null}
      {/* A fixed header leaves the flow, so without this the first block on
          every page starts underneath it and its top is unreadable. The pill
          shape floats on a 1rem margin, so it needs that much more. */}
      <div className="public-canvas" style={site.headerPosition === "fixed" ? { paddingTop: headerOffset(site) } : undefined}>
        <SiteHeader site={site} pages={site.pages} activeSlug={page.slug} />
        <main>
          <PublicBlocks blocks={blocks} pageId={page.id} />
        </main>
        <SiteFooter site={site} />
      </div>
    </>
  );
}
