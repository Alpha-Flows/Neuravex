import { notFound } from "next/navigation";
import { sanitizeCss } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { PageEditor } from "@/components/editor/PageEditor";
import { BaseBlock } from "@/types";
import { isLegalKind } from "@/lib/legal/pages";
import { headers } from "next/headers";
import { safeAccent } from "@/lib/site-fields";

export const dynamic = "force-dynamic";

export default async function PageEditorRoute(
  props: {
    params: Promise<{ id: string; pageId: string }>;
  }
) {
  const params = await props.params;
  const page = await prisma.page.findUnique({ where: { id: params.pageId } });
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: {
      // The nav the header draws, so the canvas shows the same one a visitor
      // gets rather than an empty bar.
      pages: {
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
        select: { slug: true, title: true, isHome: true, legalKind: true },
      },
    },
  });
  if (!page || !site || page.siteId !== site.id) notFound();

  // Everywhere in this site a link can point. Unlike the nav above, drafts are
  // in it: a Contact page you have not published yet is still the page you
  // mean to link to, and typing its path from memory is what this replaces.
  const linkTargets = await prisma.page.findMany({
    where: { siteId: site.id },
    orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }],
    select: { slug: true, title: true, isHome: true, published: true },
  });

  let blocks: BaseBlock[] = [];
  try {
    const parsed = JSON.parse(page.content || "[]");
    if (Array.isArray(parsed)) blocks = parsed as BaseBlock[];
  } catch {
    blocks = [];
  }

  return (
    <PageEditor
      pageId={page.id}
      siteId={site.id}
      siteSlug={site.slug}
      theme={{
        accent: safeAccent(site.accent),
        fontFamily: site.fontFamily,
        headingFont: site.headingFont,
        borderRadius: site.borderRadius,
        contentWidth: site.contentWidth,
      }}
      chrome={{
        site: {
          name: site.name,
          slug: site.slug,
          accent: safeAccent(site.accent),
          headerHtml: site.headerHtml,
          footerHtml: site.footerHtml,
          headerBackground: site.headerBackground,
          headerOpacity: site.headerOpacity,
          headerShape: site.headerShape,
          headerPosition: site.headerPosition,
        },
        // The same split the visitor gets: the legal pages sit in the footer
        // rather than in the nav, and the canvas has to show that or it is
        // showing a header nobody gets.
        pages: site.pages.filter((p) => !isLegalKind(p.legalKind)),
        legal: site.pages
          .filter((p) => isLegalKind(p.legalKind))
          .map((p) => ({ slug: p.slug, title: p.title })),
        // Sanitised here rather than in the editor. The sanitiser parses CSS
        // with postcss, which is a Node library — imported from a client
        // component it goes into the browser bundle, and the bundle does not
        // survive it. The canvas only has to place the result.
        customCss: site.customCss ? sanitizeCss(site.customCss) : null,
      }}
      linkTargets={linkTargets}
      // The <style> elements the editor writes are the app's own, so they
      // carry the request's nonce and `style-src-elem` needs nothing looser.
      nonce={(await headers()).get("x-nonce") ?? undefined}
      initial={{
        title: page.title,
        slug: page.slug,
        isHome: page.isHome,
        published: page.published,
        metaTitle: page.metaTitle ?? "",
        metaDescription: page.metaDescription ?? "",
        ogImage: page.ogImage ?? "",
        blocks,
      }}
    />
  );
}
