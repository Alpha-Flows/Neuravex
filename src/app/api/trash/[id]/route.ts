import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { restoreTrashItem } from "@/lib/trash";

export const dynamic = "force-dynamic";

/** POST /api/trash/[id] — put it back. */
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const item = await prisma.trashItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const restored = await restoreTrashItem(item);
    await prisma.trashItem.delete({ where: { id: item.id } });
    return NextResponse.json(restored);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not restore this." },
      { status: 409 },
    );
  }
}

/** DELETE /api/trash/[id] — throw this one away for good. */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await prisma.trashItem.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
