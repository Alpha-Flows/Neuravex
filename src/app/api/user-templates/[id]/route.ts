import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/user-templates/[id] — the template goes; nothing made from it
 * does, since a site or page made from a template is a copy from the start.
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const removed = await prisma.userTemplate.deleteMany({ where: { id: params.id } });
  if (removed.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
