import { notFound } from "next/navigation";
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
        customCss: site.customCss,
      }}
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
