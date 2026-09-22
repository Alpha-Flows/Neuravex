import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** DELETE /api/saved-blocks/[id] — stop offering this one. */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await prisma.savedBlock.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
