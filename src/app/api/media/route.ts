import { NextRequest, NextResponse } from "next/server";
import { readdir, unlink } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// GET /api/media — list uploaded files
export async function GET() {
  const dir = join(process.cwd(), "public", "uploads");
  const files = await readdir(dir).catch(() => [] as string[]);
  return NextResponse.json(files.map((f) => ({ url: `/uploads/${f}`, name: f })));
}

// DELETE /api/media — delete a file (body: { url: "/uploads/file.png" })
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url: string = (body.url ?? "").toString();
  if (!url.startsWith("/uploads/")) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  const name = url.slice("/uploads/".length);
  if (!name || name.includes("..")) return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  const filepath = join(process.cwd(), "public", "uploads", name);
  await unlink(filepath).catch(() => {});
  return NextResponse.json({ ok: true });
}
