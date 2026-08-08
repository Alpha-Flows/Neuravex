import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/pages/[id]/submissions
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const subs = await prisma.submission.findMany({
    where: { pageId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(subs);
}
