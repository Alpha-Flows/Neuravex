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
  const site = await prisma.site.findUnique({ where: { id: params.id } });
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
