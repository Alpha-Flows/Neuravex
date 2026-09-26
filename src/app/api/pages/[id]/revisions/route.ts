import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonObject } from "@/lib/request-body";
import { MAX_REVISIONS_PER_PAGE, cleanVersionName, nameVersion, restoreRevision } from "@/lib/revisions";
import { keepAsVersion, versionOf } from "@/lib/page-version";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** The most named versions listed; there is no limit on how many are kept. */
const MAX_NAMED_LISTED = 100;

/**
 * GET /api/pages/[id]/revisions — the named versions and the latest saves,
 * newest first.
 *
 * Asked for as one list of the newest fifty, a version named before the
 * redesign fell off the end of it fifty saves later — still in the database,
 * never pruned, and nowhere anybody could find it. So the named ones are read
 * on their own.
 */
export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params;
  const [named, saves] = await Promise.all([
    prisma.revision.findMany({ where: { pageId: params.id, name: { not: null } }, orderBy: { createdAt: "desc" }, take: MAX_NAMED_LISTED }),
    prisma.revision.findMany({ where: { pageId: params.id, name: null }, orderBy: { createdAt: "desc" }, take: MAX_REVISIONS_PER_PAGE }),
  ]);
  return NextResponse.json([...named, ...saves].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
}

/**
 * POST /api/pages/[id]/revisions
 *
 *   `{ revisionId }` — restore that version. What the page held a moment
 *     before is kept as a version of its own first, and its id comes back as
 *     `undoRevisionId`: a restore used to be final, the one change in the
 *     editor with no way back from it.
 *   `{ name }` — keep the page as it is now saved, under a name.
 *   `{ name, title, content }` — keep this content under a name without
 *     touching the page: an editor's unsaved work, set aside before it loads
 *     a newer version somebody else saved.
 */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  // Read with a cap before parsing, like every other route that takes a body:
  // this one only ever needs an id out of it, but `req.json()` will happily
  // materialise whatever it is sent first.
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (typeof body.revisionId === "string" && body.revisionId) {
    const restored = await restoreRevision(page, body.revisionId);
    if (!restored) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    return NextResponse.json({ ...restored.page, version: versionOf(restored.page), undoRevisionId: restored.undoRevisionId });
  }

  const name = cleanVersionName(body.name);
  if (!name) return NextResponse.json({ error: "A version needs a name." }, { status: 400 });

  if (body.content !== undefined) {
    const kept = await keepAsVersion(page.id, { title: typeof body.title === "string" ? body.title : page.title, content: body.content, name });
    return kept ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: "That content is not a page." }, { status: 400 });
  }
  return NextResponse.json(await nameVersion(page, name), { status: 201 });
}

// PATCH /api/pages/[id]/revisions — rename a version, or take its name away. Body: { revisionId, name }.
export async function PATCH(req: NextRequest, props: Params) {
  const params = await props.params;
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const revisionId = typeof parsed.body.revisionId === "string" ? parsed.body.revisionId : "";
  const found = await prisma.revision.findFirst({ where: { id: revisionId, pageId: params.id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  const name = cleanVersionName(parsed.body.name);
  return NextResponse.json(await prisma.revision.update({ where: { id: found.id }, data: { name, ...(name ? { manual: true } : {}) } }));
}
