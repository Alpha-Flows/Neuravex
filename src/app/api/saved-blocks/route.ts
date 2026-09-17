import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isBlock } from "@/lib/clipboard";

export const dynamic = "force-dynamic";

const MAX_SAVED_BLOCK_BYTES = 512 * 1024;

/** GET /api/saved-blocks — what has been kept for reuse, newest first. */
export async function GET() {
  const saved = await prisma.savedBlock.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(saved);
}

/** POST /api/saved-blocks — keep this block, under this name. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
  if (!isBlock(body.block)) return NextResponse.json({ error: "That is not a block." }, { status: 400 });

  const content = JSON.stringify(body.block);
  if (content.length > MAX_SAVED_BLOCK_BYTES) {
    return NextResponse.json({ error: "That block is too big to save." }, { status: 413 });
  }

  const saved = await prisma.savedBlock.create({
    data: { name: name.slice(0, 80), type: body.block.type, content },
  });
  return NextResponse.json(saved, { status: 201 });
}
