import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_SUBMISSION_BYTES = 64 * 1024;

// POST /api/submissions — store a form submission
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pageId: string | undefined = body.pageId;
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // A published page posts here with no authentication, so keep one
  // submission from being able to write an unbounded blob into the database.
  const payload = JSON.stringify(body.data ?? {});
  if (payload.length > MAX_SUBMISSION_BYTES) {
    return NextResponse.json({ error: "Submission too large" }, { status: 413 });
  }

  const sub = await prisma.submission.create({
    data: { pageId, data: payload },
  });
  return NextResponse.json(sub, { status: 201 });
}
