import { NextRequest, NextResponse } from "next/server";
import { stat } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { normalizeBlockTree } from "@/lib/block-tree";
import { existingUploadPath } from "@/lib/uploads";
import { uploadAddresses } from "@/lib/image-plan";
import { cleanSiteUrl } from "@/lib/site-address";
import { checkPage, checkSite, type CheckPage, type CheckSite, type ImageFacts } from "@/lib/prepublish";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/check — what is worth fixing before the site goes out;
 * see `lib/prepublish`. `?page=<id>` narrows it to one page, as the editor
 * asks for it.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const only = new URL(req.url).searchParams.get("page");
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    select: {
      slug: true,
      description: true,
      metaDescription: true,
      menu: true,
      footer: true,
      siteUrl: true,
      pages: {
        orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          title: true,
          slug: true,
          isHome: true,
          published: true,
          isPost: true,
          isNotFound: true,
          legalKind: true,
          metaDescription: true,
          content: true,
        },
      },
    },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Read through the validator, as every read of a page is.
  const pages: CheckPage[] = site.pages.map(({ content, ...page }) => {
    const tree = normalizeBlockTree(content || "[]");
    return { ...page, blocks: tree.ok ? tree.tree : [] };
  });

  const redirects = await prisma.pageRedirect.findMany({
    where: { siteId: params.id },
    select: { fromSlug: true, pageId: true },
  });
  const about: CheckSite = {
    slug: site.slug,
    description: site.description,
    metaDescription: site.metaDescription,
    menu: site.menu,
    footer: site.footer,
    formerSlugs: new Map(redirects.map((r) => [r.fromSlug, r.pageId])),
    siteUrl: cleanSiteUrl(site.siteUrl),
  };

  // How heavy each uploaded picture is, from the file, and how wide and what
  // it is called, from the library.
  const checked = only ? pages.filter((p) => p.id === only) : pages;
  const urls = uploadAddresses(checked.map((p) => JSON.stringify(p.blocks)).join("\n"));
  const records = await prisma.mediaFile.findMany({ where: { url: { in: urls } }, select: { url: true, width: true, name: true } });
  const images = new Map<string, ImageFacts>();
  for (const url of urls) {
    const path = existingUploadPath(url.slice("/uploads/".length));
    const info = path ? await stat(path).catch(() => null) : null;
    if (!info) continue;
    const record = records.find((r) => r.url === url);
    images.set(url, { bytes: info.size, width: record?.width, name: record?.name });
  }

  const findings = only ? checked.flatMap((page) => checkPage(page, about, pages, images)) : checkSite(about, pages, images);

  return NextResponse.json({
    findings,
    pages: pages.map((p) => ({ id: p.id, title: p.title, published: p.published })),
  });
}
