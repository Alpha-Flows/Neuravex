import { NextRequest, NextResponse } from "next/server";
import { readdir, unlink } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Which pages reference each uploaded file.
 *
 * A page's blocks are stored as a JSON string, so the upload's URL appears
 * verbatim wherever it is used — as a block's src, a section background, or
 * a social image. Deleting a file used to silently break every page pointing
 * at it, with no way to find out which.
 */
async function usageByUrl(urls: string[]): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>(urls.map((u) => [u, []]));
  if (urls.length === 0) return usage;

  const pages = await prisma.page.findMany({
    select: { title: true, content: true, ogImage: true },
  });
  for (const page of pages) {
    const haystack = `${page.content ?? ""} ${page.ogImage ?? ""}`;
    for (const url of urls) {
      if (haystack.includes(url)) usage.get(url)!.push(page.title);
    }
  }
  return usage;
}

// GET /api/media — list uploaded files, with the pages using each one
export async function GET() {
  const dir = join(process.cwd(), "public", "uploads");
  const files = await readdir(dir).catch(() => [] as string[]);
  const urls = files.map((f) => `/uploads/${f}`);
  const usage = await usageByUrl(urls);
  return NextResponse.json(
    files.map((f) => {
      const url = `/uploads/${f}`;
      return { url, name: f, usedOn: usage.get(url) ?? [] };
    }),
  );
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
