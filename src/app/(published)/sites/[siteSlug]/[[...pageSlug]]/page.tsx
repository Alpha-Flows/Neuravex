import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { PublishedPageView, loadPublishedSite } from "@/components/public/PublishedPage";
import { pageUrl } from "@/lib/seo";
import { pagePath } from "@/lib/page-links";
import { hreflangLinks } from "@/lib/translations";
import { publicOrigin } from "@/lib/self-origin";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string; pageSlug?: string[] }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: { id: true, slug: true, name: true, description: true, metaTitle: true, metaDescription: true, ogImage: true, favicon: true, language: true },
  });
  if (!site) return {};
  const pageSlug = params.pageSlug?.join("/");
  const pages = await prisma.page.findMany({
    where: { siteId: site.id, published: true },
    orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
    select: {
      id: true, slug: true, title: true, isHome: true, isNotFound: true, isPost: true, metaTitle: true, metaDescription: true, ogImage: true,
      language: true, translationGroup: true,
    },
  });
  const page = pageSlug ? pages.find((p) => p.slug === pageSlug) : pages.find((p) => p.isHome) ?? pages[0];
  const title = page?.metaTitle || site.metaTitle || page?.title || site.name;
  const desc = page?.metaDescription || site.metaDescription || site.description || undefined;
  const og = page?.ogImage || site.ogImage || undefined;

  // A canonical address, so the home page reached at /sites/x and
  // /sites/x/index is not counted as two pages with the same content.
  const canonical = page ? pageUrl("", site.slug, page.slug, page.isHome) : undefined;
  // Every published version of this page in another language, and this one,
  // so a search engine shows a German reader the German page rather than
  // counting the two as one page said twice.
  const languages = page ? hreflangLinks(page, pages, site.language, (p) => pageUrl("", site.slug, p.slug, p.isHome)) : {};

  // Without a metadataBase Next resolves a relative og:image against
  // `http://localhost:<port>` — so the exported page advertised a picture at
  // an address that exists only on the machine that built it, and a proxied
  // instance advertised its internal port whatever Host it was asked on.
  let metadataBase: URL | undefined;
  try {
    metadataBase = new URL(publicOrigin(await headers()));
  } catch {
    metadataBase = undefined;
  }

  return {
    metadataBase,
    title,
    description: desc,
    openGraph: { title, description: desc, type: "website", ...(og ? { images: [og] } : {}) },
    alternates: {
      ...(canonical ? { canonical } : {}),
      ...(Object.keys(languages).length ? { languages } : {}),
      // Where a reader finds the posts, on every page of a site that has some.
      ...(pages.some((p) => p.isPost) ? { types: { "application/atom+xml": [{ url: `/sites/${site.slug}/feed.xml`, title: site.name }] } } : {}),
    },
    // The "not found" page reached at its own address is still not a page
    // anyone should find in a search.
    ...(page?.isNotFound ? { robots: { index: false, follow: true } } : {}),
    icons: site.favicon ? { icon: site.favicon } : undefined,
  };
}

export default async function PublicSitePage(props: Props) {
  const params = await props.params;
  // See `loadPublishedSite` for why only some columns are read.
  const site = await loadPublishedSite(params.siteSlug);
  if (!site) notFound();

  const pageSlug = params.pageSlug?.join("/");
  const page = pageSlug
    ? site.pages.find((p) => p.slug === pageSlug)
    : site.pages.find((p) => p.isHome) ?? site.pages[0];
  if (!page && pageSlug) await forwardFormerAddress(site.id, site.slug, pageSlug);
  // An address that goes nowhere is answered by the 404 boundary beside the
  // layout, which draws the site's own "not found" page when it has one.
  if (!page) notFound();

  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <PublishedPageView site={site} page={page} nonce={nonce} />;
}

/**
 * An address a page had before it was renamed, sent on to where the page is
 * now; see `afterRename`. Nothing happens when the address was never a page's,
 * or the page it became is not published.
 *
 * A 307 rather than a 308. A browser keeps a permanent redirect for good, so
 * an author who renamed a page back, or gave its old address to a new page,
 * would go on being sent away from it by their own browser. The download's
 * forwarding pages are the permanent kind, and are where search engines will
 * meet them.
 */
async function forwardFormerAddress(siteId: string, siteSlug: string, fromSlug: string) {
  const former = await prisma.pageRedirect.findUnique({
    where: { siteId_fromSlug: { siteId, fromSlug } },
    select: { page: { select: { slug: true, isHome: true, published: true } } },
  });
  if (former?.page.published) redirect(pagePath(siteSlug, former.page.slug, former.page.isHome));
}
