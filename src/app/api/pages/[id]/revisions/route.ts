import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/pages/[id]/revisions — list revisions
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const revs = await prisma.revision.findMany({
    where: { pageId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(revs);
}

// POST /api/pages/[id]/restore — restore a revision
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const revId: string | undefined = body.revisionId;
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
