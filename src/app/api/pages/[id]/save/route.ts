import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { snapshotRevision } from "@/lib/revisions";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

interface SaveBody {
  title?: string;
  slug?: string;
  published?: boolean;
  isHome?: boolean;
  content?: unknown; // BaseBlock[] tree
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  /** "manual" for Cmd+S / the Save button, "autosave" for the timer. */
  reason?: "manual" | "autosave";
}

// Persist the full page (title, slug, flags, and the entire block tree as JSON).
export async function PUT(req: NextRequest, { params }: Params) {
  const body = (await req.json().catch(() => ({}))) as SaveBody;
  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.published === "boolean") data.published = body.published;
  if (typeof body.isHome === "boolean") {
    data.isHome = body.isHome;
    // Unset home on all other pages in the same site to keep only one home page.
    if (body.isHome) {
      await prisma.page.updateMany({
        where: { siteId: page.siteId, id: { not: page.id }, isHome: true },
        data: { isHome: false },
      });
    }
  }
  // The editor sends the slug on every save. It used to be declared here and
  // then dropped on the floor, so renaming a page's URL in the editor did
  // nothing at all — the status line said "Saved" and the address reverted on
  // the next load, with "View live" pointing at a page that was not there.
  if (typeof body.slug === "string" && body.slug.trim()) {
    let newSlug = slugify(body.slug);
    if (newSlug && newSlug !== page.slug) {
      let suffix = 0;
      const base = newSlug;
      while (true) {
        const existing = await prisma.page.findUnique({
          where: { siteId_slug: { siteId: page.siteId, slug: newSlug } },
        });
        if (!existing || existing.id === page.id) break;
        suffix += 1;
        newSlug = `${base}-${suffix}`;
      }
      data.slug = newSlug;
    }
  }
  if (body.content !== undefined) data.content = JSON.stringify(body.content);
  // Per-page SEO. Empty means "fall back to the site default", so it is
  // stored as null rather than an empty string.
  for (const key of ["metaTitle", "metaDescription", "ogImage"] as const) {
    const value = body[key];
    if (typeof value === "string") data[key] = value.trim() || null;
    else if (value === null) data[key] = null;
  }

  const updated = await prisma.page.update({ where: { id: params.id }, data });

  if (body.content !== undefined || typeof body.title === "string") {
    await snapshotRevision(page.id, {
      title: (typeof body.title === "string" ? body.title.trim() : page.title) || "Untitled",
      content: body.content !== undefined ? JSON.stringify(body.content) : page.content,
      manual: body.reason === "manual",
    });
  }

  return NextResponse.json(updated);
}
