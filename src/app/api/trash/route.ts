import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/trash — what has been deleted, newest first. */
export async function GET() {
  const items = await prisma.trashItem.findMany({
    orderBy: { deletedAt: "desc" },
    select: { id: true, kind: true, label: true, siteId: true, siteName: true, deletedAt: true },
  });
  return NextResponse.json(items);
}

/** DELETE /api/trash — empty it. Everything in here goes for good. */
export async function DELETE() {
  const { count } = await prisma.trashItem.deleteMany({});
  return NextResponse.json({ ok: true, count });
}
