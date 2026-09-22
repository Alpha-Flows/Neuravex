import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/submissions/[id] — erase one answer.
 *
 * There was no delete route anywhere, while the Datenschutzerklärung the
 * builder generates promises the visitor an Art. 17 right to erasure. This is
 * the one-card version of that; the collection route next door does "all of
 * them" and "everything older than".
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 const deleted = await prisma.submission.delete({ where: { id: params.id } }).catch(() => null);
 if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ ok: true });
}
