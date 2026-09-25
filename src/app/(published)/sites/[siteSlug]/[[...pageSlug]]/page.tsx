import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BaseBlock } from "@/types";
import { PublicBlocks } from "@/components/public/PublicBlocks";
import type { Metadata } from "next";
import { sanitizeCss } from "@/lib/security";
import { siteThemeCss, headerOffset } from "@/lib/site-theme";
import { pageUrl } from "@/lib/seo";
import { SiteHeader, SiteFooter } from "@/components/public/SiteChrome";
import { isLegalKind } from "@/lib/legal/pages";
import { publicOrigin } from "@/lib/self-origin";
import { safeAccent } from "@/lib/site-fields";
import { headers } from "next/headers";
import { normalizeBlockTree } from "@/lib/block-tree";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteSlug: string; pageSlug?: string[] }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: { id: true, slug: true, name: true, description: true, metaTitle: true, metaDescription: true, ogImage: true, favicon: true },
  });
  if (!site) return {};
  const pageSlug = params.pageSlug?.join("/");
  const pages = await prisma.page.findMany({
    where: { siteId: site.id, published: true },
    orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
    select: { slug: true, title: true, isHome: true, metaTitle: true, metaDescription: true, ogImage: true },
  });
  const page = pageSlug ? pages.find((p) => p.slug === pageSlug) : pages.find((p) => p.isHome) ?? pages[0];
  const title = page?.metaTitle || site.metaTitle || page?.title || site.name;
  const desc = page?.metaDescription || site.metaDescription || site.description || undefined;
  const og = page?.ogImage || site.ogImage || undefined;

  // A canonical address, so the home page reached at /sites/x and
  // /sites/x/index is not counted as two pages with the same content.
  const canonical = page ? pageUrl("", site.slug, page.slug, page.isHome) : undefined;

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
    alternates: canonical ? { canonical } : undefined,
    icons: site.favicon ? { icon: site.favicon } : undefined,
  };
}

export default async function PublicSitePage(props: Props) {
  const params = await props.params;
  /**
   * Only the columns the page draws with.
   *
   * This used to load the whole row with every page included, and hand it to
   * `SiteChrome`, which is a client component. React Flight serialises the
   * runtime object rather than the TypeScript prop type, and React 18 does not
   * dedupe plain objects — so every published page carried, inside
   * `self.__next_f.push(...)`, the raw `legal` profile (a data protection
   * officer's private address, representatives, notes typed at any wizard
   * step, for a site that never generated a legal page), the unsanitised
   * source of `customCss`, `headerHtml` and `footerHtml`, and every page's
   * full content. Twice. Visitors were served all of it.
   */
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      accent: true,
      fontFamily: true,
      headingFont: true,
      fonts: true,
      palette: true,
      textStyles: true,
      borderRadius: true,
      contentWidth: true,
      customCss: true,
      headerHtml: true,
      footerHtml: true,
      headerBackground: true,
      headerOpacity: true,
      headerShape: true,
      headerPosition: true,
      logo: true,
      menu: true,
      footer: true,
      pages: {
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
        select: { id: true, slug: true, title: true, isHome: true, legalKind: true, content: true },
      },
    },
  });
  if (!site) notFound();

  const pageSlug = params.pageSlug?.join("/");
  const page = pageSlug
    ? site.pages.find((p) => p.slug === pageSlug)
    : site.pages.find((p) => p.isHome) ?? site.pages[0];
  if (!page) notFound();

  // The Impressum and the Datenschutzerklärung belong in the footer of every
  // page, not in the nav beside About and Contact — placed rather than
  // offered, because § 5 DDG asks for "ständig verfügbar" and a visitor
  // should not have to hunt for either.
  // Small objects, built by hand, so the flight payload carries the title and
  // the slug of each page and not its content.
  const legal = site.pages
    .filter((p) => isLegalKind(p.legalKind))
    .map((p) => ({ slug: p.slug, title: p.title }));
  const navPages = site.pages
    .filter((p) => !isLegalKind(p.legalKind))
    .map((p) => ({ id: p.id, slug: p.slug, title: p.title, isHome: p.isHome }));

  const chrome = {
    name: site.name,
    slug: site.slug,
    accent: safeAccent(site.accent),
    headerHtml: site.headerHtml,
    footerHtml: site.footerHtml,
    headerBackground: site.headerBackground,
    headerOpacity: site.headerOpacity,
    headerShape: site.headerShape,
    headerPosition: site.headerPosition,
    logo: site.logo,
    menu: site.menu,
  };

  // The tree is validated on the way in now; this is the layer under that, for
  // a row written before it existed.
  const checked = normalizeBlockTree(page.content || "[]");
  const blocks: BaseBlock[] = checked.ok ? checked.tree : [];

  // These two are the app's own stylesheets, so they carry the request nonce
  // and `style-src-elem` can stay as tight as `script-src`.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      {/* The site's branding, which every block without a colour of its own
          reads. Always emitted: a block's fallback is the accent, not a hex. */}
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: siteThemeCss(site) }} />
      {site.customCss ? <style nonce={nonce} dangerouslySetInnerHTML={{ __html: sanitizeCss(site.customCss) }} /> : null}
      {/* A fixed header leaves the flow, so without this the first block on
          every page starts underneath it and its top is unreadable. The pill
          shape floats on a 1rem margin, so it needs that much more. */}
      <div className="public-canvas" style={site.headerPosition === "fixed" ? { paddingTop: headerOffset(site) } : undefined}>
        <SiteHeader site={chrome} pages={navPages} activeSlug={page.slug} />
        <main>
          <PublicBlocks blocks={blocks} pageId={page.id} />
        </main>
        <SiteFooter site={{ name: chrome.name, slug: chrome.slug, footerHtml: chrome.footerHtml, footer: site.footer }} legal={legal} />
      </div>
    </>
  );
}
