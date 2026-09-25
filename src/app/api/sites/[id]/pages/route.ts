import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { startingContent } from "@/lib/page-starters";
import { normalizeBlockTreeJson } from "@/lib/block-tree";
import { readJsonObject } from "@/lib/request-body";
import { pageContentFromTemplate } from "@/lib/user-templates";
import { postDateFrom } from "@/lib/posts";

export const dynamic = "force-dynamic";

// /api/sites/:id/pages
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { searchParams } = new URL(req.url);
  const includeUnpublished = searchParams.get("all") === "1";
  // Same order the site admin and the published nav use, so a page sits in
  // the same place everywhere it is listed.
  const pages = await prisma.page.findMany({
    where: { siteId: params.id, ...(includeUnpublished ? {} : { published: true }) },
    orderBy: [{ sortOrder: "asc" }, { isHome: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json(pages);
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const title = (typeof body.title === "string" && body.title.trim() ? body.title : "Untitled page")
    .toString()
    .trim()
    .slice(0, 300);
  let slug = slugify(typeof body.slug === "string" && body.slug ? body.slug : title) || "page";

  let suffix = 0;
  const base = slug;
  while (await prisma.page.findUnique({ where: { siteId_slug: { siteId: params.id, slug } } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  const maxOrder = await prisma.page.findFirst({
    where: { siteId: params.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  /**
   * What the page opens on.
   *
   * Content handed in wins — that is a duplicate, an import or an agent
   * writing a page it has already composed. Otherwise the page is built from
   * a starter, drawn in the look read off the site's existing pages, so a new
   * page arrives dressed like the site it was made in instead of as the bare
   * `[]` it used to be.
   */
  let content: string;
  if (typeof body.userTemplateId === "string") {
    // A page somebody kept, with its links moved to this site's address.
    const site = await prisma.site.findUnique({ where: { id: params.id }, select: { slug: true } });
    const kept = site ? await pageContentFromTemplate(body.userTemplateId, site.slug) : null;
    if (kept === null) return NextResponse.json({ error: "That template is gone." }, { status: 404 });
    content = kept;
  } else if (typeof body.content === "string") {
    const tree = normalizeBlockTreeJson(body.content);
    if (!tree.ok) return NextResponse.json({ error: tree.error }, { status: 400 });
    content = tree.json;
  } else {
    // Reading the siblings to pick a starting look used to be where a `null`
    // node in one of them threw, so no new page could be created on that site
    // at all. The starter walks a validated tree now, and anything it cannot
    // read is skipped rather than fatal.
    const siblings = await prisma.page.findMany({
      where: { siteId: params.id },
      select: { content: true },
    });
    const usable = siblings
      .map((p) => normalizeBlockTreeJson(p.content))
      .filter((t): t is { ok: true; json: string } => t.ok)
      .map((t) => t.json);
    content = startingContent(typeof body.starter === "string" ? body.starter : undefined, usable, title);
  }

  // A post starts dated today and with something to write into; see `lib/posts.ts`.
  const isPost = body.post === true;
  if (isPost && typeof body.content !== "string" && typeof body.userTemplateId !== "string") {
    content = JSON.stringify(normalizeTreeOrEmpty(FIRST_POST_BLOCKS));
  }

  const page = await prisma.page.create({
    data: {
      siteId: params.id,
      title,
      slug,
      isHome: false,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      content,
      ...(isPost ? { isPost: true, postDate: postDateFrom(new Date().toISOString().slice(0, 10)) } : {}),
    },
  });

  // The first post of a site brings a page to list the posts on, as a draft,
  // unless one already has a posts block: a post nobody can find from the
  // site is written for no one, and "add a page and a posts block to it" is
  // not a step anyone guesses.
  const blogPage = isPost ? await ensureBlogPage(params.id) : null;
  return NextResponse.json(blogPage ? { ...page, blogPage } : page, { status: 201 });
}

/** What a new post opens on: a paragraph to write over. */
const FIRST_POST_BLOCKS = [
  {
    id: "p1",
    type: "text",
    props: { text: "Start writing here. The title, date and cover above come from the post's settings, on the right when nothing is selected.", align: "left", size: "lg", color: "" },
  },
];

function normalizeTreeOrEmpty(blocks: unknown[]): unknown[] {
  const tree = normalizeBlockTreeJson(blocks);
  return tree.ok ? JSON.parse(tree.json) : [];
}

/**
 * A "Blog" page listing the site's posts, made when a site has none: no page
 * carries a posts block yet. It is made as a draft, so nothing appears on the
 * published site until it is looked at and published.
 */
async function ensureBlogPage(siteId: string): Promise<{ id: string; slug: string } | null> {
  const pages = await prisma.page.findMany({ where: { siteId }, select: { content: true, slug: true, sortOrder: true } });
  if (pages.some((p) => p.content.includes('"type":"posts"'))) return null;
  let slug = "blog";
  for (let n = 1; pages.some((p) => p.slug === slug); n++) slug = `blog-${n}`;
  const blocks = normalizeTreeOrEmpty([
    { id: "h1", type: "heading", props: { text: "Blog", level: 1, align: "left", color: "", weight: "bold" } },
    { id: "posts", type: "posts", props: {} },
  ]);
  const made = await prisma.page.create({
    data: {
      siteId,
      title: "Blog",
      slug,
      sortOrder: Math.max(-1, ...pages.map((p) => p.sortOrder)) + 1,
      content: JSON.stringify(blocks),
    },
    select: { id: true, slug: true },
  });
  return made;
}
