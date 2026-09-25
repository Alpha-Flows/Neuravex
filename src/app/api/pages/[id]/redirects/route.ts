import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonObject } from "@/lib/request-body";
import { formerSlugs } from "@/lib/page-rename";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/pages/[id]/redirects — the page's old addresses, newest first.
export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params;
  return NextResponse.json({ formerSlugs: await formerSlugs(params.id) });
}

/**
 * DELETE /api/pages/[id]/redirects — stop one old address forwarding here.
 * Body: `{ from: "<old slug>" }`.
 *
 * For an address that should become nothing at all — a page renamed away
 * from a name that was a mistake — or be free for a different page. Giving
 * the address to another page takes it over anyway; see `afterRename`.
 */
export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const from = typeof parsed.body.from === "string" ? parsed.body.from : "";
  if (!from) return NextResponse.json({ error: "Which old address?" }, { status: 400 });
  await prisma.pageRedirect.deleteMany({ where: { pageId: params.id, fromSlug: from } });
  return NextResponse.json({ formerSlugs: await formerSlugs(params.id) });
}
