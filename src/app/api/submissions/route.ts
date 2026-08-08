import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/submissions — store a form submission
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pageId: string | undefined = body.pageId;
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const sub = await prisma.submission.create({
    data: { pageId, data: JSON.stringify(body.data ?? {}) },
  });
  return NextResponse.json(sub, { status: 201 });
}
