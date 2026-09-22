import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonObject } from "@/lib/request-body";

export const dynamic = "force-dynamic";

// GET /api/pages/[id]/revisions — list revisions
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const revs = await prisma.revision.findMany({
    where: { pageId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(revs);
}

// POST /api/pages/[id]/restore — restore a revision
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Read with a cap before parsing, like every other route that takes a body:
  // this one only ever needs an id out of it, but `req.json()` will happily
  // materialise whatever it is sent first.
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;

  const revId = typeof parsed.body.revisionId === "string" ? parsed.body.revisionId : "";
  if (!revId) return NextResponse.json({ error: "revisionId required" }, { status: 400 });

  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rev = await prisma.revision.findFirst({ where: { id: revId, pageId: params.id } });
  if (!rev) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

  const updated = await prisma.page.update({
    where: { id: params.id },
    data: { title: rev.title, content: rev.content },
  });
  return NextResponse.json(updated);
}
