import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { snapshotRevision } from "@/lib/revisions";
import { normalizeBlockTree } from "@/lib/block-tree";
import { settleSyncedBlocks, type SyncedOutcome } from "@/lib/synced-store";
import { normalizePostFields } from "@/lib/posts";
import { readJsonObject } from "@/lib/request-body";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

interface SaveBody {
  title?: string;
  slug?: string;
  published?: boolean;
  isHome?: boolean;
  /** The site's "not found" page. Setting it takes it off any other page. */
  isNotFound?: boolean;
  content?: unknown; // BaseBlock[] tree
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  /** "manual" for Cmd+S / the Save button, "autosave" for the timer. */
  reason?: "manual" | "autosave";
  /** The version of each synced block the editor started from; see `settleSyncedBlocks`. */
  syncedBase?: Record<string, string>;
}

// Persist the full page (title, slug, flags, and the entire block tree as JSON).
export async function PUT(req: NextRequest, props: Params) {
  const params = await props.params;
  // Size-checked before it is parsed, not after: the previous shape read the
  // whole body into memory and then decided whether it was too big.
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as SaveBody;

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
  if (typeof body.isNotFound === "boolean") {
    data.isNotFound = body.isNotFound;
    if (body.isNotFound) {
      await prisma.page.updateMany({
        where: { siteId: page.siteId, id: { not: page.id }, isNotFound: true },
        data: { isNotFound: false },
      });
    }
  }
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
  // The one description of what a block tree may be. Nothing checked this
  // before, so a mistyped prop was a durable 500 on the editor and the public
  // page with no error boundary to click past, and a `javascript:` href went
  // straight into the customer's downloaded site.
  let content: string | undefined;
  let synced: SyncedOutcome | undefined;
  if (body.content !== undefined) {
    const tree = normalizeBlockTree(body.content);
    if (!tree.ok) return NextResponse.json({ error: tree.error }, { status: 400 });
    // A synced block changed here reaches every other page that has it; one
    // this editor had not caught up with is brought up to date instead.
    const bases = body.syncedBase && typeof body.syncedBase === "object" ? (body.syncedBase as Record<string, string>) : undefined;
    synced = await settleSyncedBlocks(page.id, tree.tree, bases);
    content = JSON.stringify(synced.tree);
    data.content = content;
  }
  // Per-page SEO. Empty means "fall back to the site default", so it is
  // stored as null rather than an empty string.
  // A post's details, repaired: see `normalizePostFields`.
  Object.assign(data, normalizePostFields(body as Record<string, unknown>));
  for (const key of ["metaTitle", "metaDescription", "ogImage"] as const) {
    const value = body[key];
    if (typeof value === "string") data[key] = value.trim() || null;
    else if (value === null) data[key] = null;
  }

  const updated = await prisma.page.update({ where: { id: params.id }, data });

  if (body.content !== undefined || typeof body.title === "string") {
    await snapshotRevision(page.id, {
      title: (typeof body.title === "string" ? body.title.trim() : page.title) || "Untitled",
      content: content ?? page.content,
      manual: body.reason === "manual",
    });
  }

  // The synced blocks brought up to date here, so the editor can show them.
  return NextResponse.json(synced && Object.keys(synced.refreshed).length > 0 ? { ...updated, syncedRefreshed: synced.refreshed } : updated);
}
