import { notFound } from "next/navigation";
import { sanitizeCss } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { PageEditor } from "@/components/editor/PageEditor";
import { BaseBlock } from "@/types";

export const dynamic = "force-dynamic";

export default async function PageEditorRoute({
  params,
}: {
  params: { id: string; pageId: string };
}) {
  const page = await prisma.page.findUnique({ where: { id: params.pageId } });
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: {
      // The nav the header draws, so the canvas shows the same one a visitor
      // gets rather than an empty bar.
      pages: {
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }],
        select: { slug: true, title: true, isHome: true },
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
        accent: site.accent,
        fontFamily: site.fontFamily,
        headingFont: site.headingFont,
        borderRadius: site.borderRadius,
        contentWidth: site.contentWidth,
      }}
      chrome={{
        site: {
          name: site.name,
          slug: site.slug,
          accent: site.accent,
          headerHtml: site.headerHtml,
          footerHtml: site.footerHtml,
          headerBackground: site.headerBackground,
          headerOpacity: site.headerOpacity,
          headerShape: site.headerShape,
          headerPosition: site.headerPosition,
        },
        pages: site.pages,
        // Sanitised here rather than in the editor. The sanitiser parses CSS
        // with postcss, which is a Node library — imported from a client
        // component it goes into the browser bundle, and the bundle does not
        // survive it. The canvas only has to place the result.
        customCss: site.customCss ? sanitizeCss(site.customCss) : null,
      }}
      linkTargets={linkTargets}
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
