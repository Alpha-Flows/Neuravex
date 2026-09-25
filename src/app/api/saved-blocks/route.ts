import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeBlockTree } from "@/lib/block-tree";
import { readJsonObject } from "@/lib/request-body";

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

/**
 * POST /api/saved-blocks — keep this block, under this name.
 *
 * A saved block is not a note about a block: it is stored markup that a later
 * click drops straight into a page. That makes this a write path into a block
 * tree, like save, import, paste and the MCP server — and it was the one that
 * did not go through the shared validator. `isBlock()` asked only whether `id`
 * and `type` were strings, so anything else in the object was stored verbatim
 * and inserted verbatim: an unchecked `href`, a `style` that fetches, a tree
 * deep enough to overflow the stack on the page it lands in.
 */
export async function POST(req: NextRequest) {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

  // The same reading every other write path uses. It repairs what it can and
  // drops what it cannot, so an empty result means there was no block here.
  const checked = normalizeBlockTree([body.block]);
  if (!checked.ok || checked.tree.length === 0) {
    return NextResponse.json({ error: "That is not a block." }, { status: 400 });
  }
  const block = checked.tree[0];

  const content = JSON.stringify(block);
  if (content.length > MAX_SAVED_BLOCK_BYTES) {
    return NextResponse.json({ error: "That block is too big to save." }, { status: 413 });
  }

  // Kept in sync, the saved block is what every copy of it becomes; the copy
  // it was made from is marked by the editor once it has the id.
  // Where the copy sat on its page is not part of it.
  const synced = body.synced === true;
  const { synced: _marker, layer: _layer, column: _column, ...shared } = block;
  const saved = await prisma.savedBlock.create({
    data: { name: name.slice(0, 80), type: block.type, content: synced ? JSON.stringify(shared) : content, synced },
  });
  return NextResponse.json(saved, { status: 201 });
}
