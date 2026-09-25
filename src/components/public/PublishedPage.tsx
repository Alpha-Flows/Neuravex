import { prisma } from "@/lib/prisma";
import { BaseBlock } from "@/types";
import { PublicBlocks } from "@/components/public/PublicBlocks";
import { sanitizeCss } from "@/lib/security";
import { siteThemeCss, headerOffset } from "@/lib/site-theme";
import { SiteHeader, SiteFooter } from "@/components/public/SiteChrome";
import { isLegalKind } from "@/lib/legal/pages";
import { safeAccent } from "@/lib/site-fields";
import { normalizeBlockTree } from "@/lib/block-tree";
import { postItems } from "@/lib/posts";
import { SitePostsProvider } from "@/components/blocks/site-posts";
import { PostHeader } from "@/components/public/PostHeader";
import { homeFor, languageSwitch, pageLanguage, sameLanguage } from "@/lib/translations";
import { srcSetsFor } from "@/lib/image-variants";
import { businessData, faqPage, jsonLd, questionsOf } from "@/lib/structured-data";
import { parseProfile } from "@/lib/legal/profile";
import { normalizeLogo } from "@/lib/site-logo";
import { normalizeFooter } from "@/lib/footer";
import { publicOrigin } from "@/lib/self-origin";
import { headers } from "next/headers";
import { ImageVariantsProvider } from "@/components/blocks/image-variants";

/**
 * A published page, drawn: the site's branding, its header, the page's
 * blocks and its footer.
 *
 * It lived inside the page route. The site's own "not found" page is drawn
 * the same way from the 404 boundary, which is a different file with no
 * route params, so the drawing and the query it needs are here for both.
 */

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
export async function loadPublishedSite(slug: string) {
  return prisma.site.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      ogImage: true,
      businessType: true,
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
      language: true,
      pages: {
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          isHome: true,
          legalKind: true,
          isNotFound: true,
          content: true,
          isPost: true,
          postDate: true,
          author: true,
          excerpt: true,
          coverImage: true,
          tags: true,
          createdAt: true,
          language: true,
          translationGroup: true,
        },
      },
    },
  });
}

export type PublishedSite = NonNullable<Awaited<ReturnType<typeof loadPublishedSite>>>;
export type PublishedPageRow = PublishedSite["pages"][number];

export async function PublishedPageView({
  site,
  page,
  nonce,
}: {
  site: PublishedSite;
  page: PublishedPageRow;
  nonce?: string;
}) {
  // The Impressum and the Datenschutzerklärung belong in the footer of every
  // page, not in the nav beside About and Contact — placed rather than
  // offered, because § 5 DDG asks for "ständig verfügbar" and a visitor
  // should not have to hunt for either. The "not found" page is in neither:
  // it is what a visitor meets when an address goes nowhere, not a page to
  // go to.
  // Small objects, built by hand, so the flight payload carries the title and
  // the slug of each page and not its content.
  const legal = site.pages
    .filter((p) => isLegalKind(p.legalKind))
    .map((p) => ({ slug: p.slug, title: p.title }));
  // Posts are in neither either: they are listed by the posts block and the
  // feed, and a menu with every post in it is not a menu.
  const navPages = site.pages
    .filter((p) => !isLegalKind(p.legalKind) && !p.isNotFound && !p.isPost)
    .map((p) => ({ id: p.id, slug: p.slug, title: p.title, isHome: p.isHome, language: p.language, translationGroup: p.translationGroup }));
  // The page's own language, and the ways to it in the site's others. Posts
  // have translations as much as pages do, so the switcher is offered from
  // every page a reader chooses a language on: not the legal pages, and not
  // the "not found" page.
  const language = pageLanguage(page, site.language);
  const switchable = site.pages
    .filter((p) => !isLegalKind(p.legalKind) && !p.isNotFound)
    .map((p) => ({ id: p.id, slug: p.slug, title: p.title, isHome: p.isHome, language: p.language, translationGroup: p.translationGroup }));
  const links = languageSwitch(page, switchable, site.language, site.slug);
  const home = links.length ? homeFor(language, navPages, site.language) : undefined;
  const languages = links.length
    ? {
        code: language,
        siteLanguage: site.language,
        links,
        homeHref: home ? (home.isHome ? `/sites/${site.slug}` : `/sites/${site.slug}/${home.slug}`) : undefined,
      }
    : undefined;
  // Small objects again, and only the published posts in this page's
  // language, for the posts blocks: a German blog page lists German posts.
  const posts = postItems(
    site.pages.filter((p) => sameLanguage(pageLanguage(p, site.language), language)),
    site.slug,
  );
  const post = page.isPost ? posts.find((p) => p.id === page.id) : undefined;

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

  // The smaller copies of the pictures on this page and the covers its posts
  // blocks show, so a phone is sent a picture the size of a phone.
  const srcSets = await srcSetsFor([JSON.stringify(blocks), ...posts.map((p) => p.coverImage)]);

  // What the page says to search engines in their own terms; see
  // `lib/structured-data`. Rendered here, on the server, as data a browser
  // never runs.
  const structured = await structuredDataFor(site, page, blocks);

  return (
    <>
      {/* The site's branding, which every block without a colour of its own
          reads. Always emitted: a block's fallback is the accent, not a hex.
          These two are the app's own stylesheets, so they carry the request
          nonce and `style-src-elem` can stay as tight as `script-src`. */}
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: siteThemeCss(site) }} />
      {site.customCss ? <style nonce={nonce} dangerouslySetInnerHTML={{ __html: sanitizeCss(site.customCss) }} /> : null}
      {/* A fixed header leaves the flow, so without this the first block on
          every page starts underneath it and its top is unreadable. The pill
          shape floats on a 1rem margin, so it needs that much more. */}
      <div
        className="public-canvas"
        lang={language}
        style={site.headerPosition === "fixed" ? { paddingTop: headerOffset(site) } : undefined}
      >
        {structured.map((json, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
        ))}
        <SiteHeader site={chrome} pages={navPages} activeSlug={page.slug} languages={languages} />
        <main>
          <ImageVariantsProvider value={srcSets}>
            <SitePostsProvider posts={posts} language={language}>
              {post ? <PostHeader post={post} language={language} coverSrcSet={post.coverImage ? srcSets[post.coverImage] : undefined} /> : null}
              <PublicBlocks blocks={blocks} pageId={page.id} />
            </SitePostsProvider>
          </ImageVariantsProvider>
        </main>
        <SiteFooter site={{ name: chrome.name, slug: chrome.slug, footerHtml: chrome.footerHtml, footer: site.footer }} legal={legal} />
      </div>
    </>
  );
}

/**
 * The page's structured data, as JSON-LD bodies: the business on the home
 * page when the operator has said what kind it is, and the questions of the
 * page's accordions.
 *
 * The legal details are read here and nowhere near the objects this page
 * hands to client components — see `loadPublishedSite` for what happened when
 * the whole profile was — and only the fields `businessData` picks go out.
 */
async function structuredDataFor(site: PublishedSite, page: PublishedPageRow, blocks: BaseBlock[]): Promise<string[]> {
  const out: string[] = [];
  if (page.isHome && site.businessType) {
    const origin = publicOrigin(await headers());
    const absolute = (src: string | null | undefined) =>
      src ? (src.startsWith("/") ? `${origin}${src}` : /^https?:\/\//i.test(src) ? src : undefined) : undefined;
    const legal = await prisma.site.findUnique({ where: { id: site.id }, select: { legal: true } });
    const business = businessData({
      type: site.businessType,
      siteName: site.name,
      description: site.description,
      url: `${origin}/sites/${site.slug}`,
      logo: absolute(normalizeLogo(site.logo)?.src),
      image: absolute(site.ogImage),
      legal: parseProfile(legal?.legal),
      social: normalizeFooter(site.footer)?.social,
    });
    if (business) out.push(jsonLd(business));
  }
  const faq = faqPage(questionsOf(blocks));
  if (faq) out.push(jsonLd(faq));
  return out;
}
