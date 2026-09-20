import { NextRequest, NextResponse } from "next/server";
import { readdir, unlink } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { cleanAlt, cleanName, displayName } from "@/lib/media";

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

/** The file is the record; what a person knows about it sits beside it. */
function isUploadUrl(url: string): boolean {
  if (!url.startsWith("/uploads/")) return false;
  const name = url.slice("/uploads/".length);
  return name.length > 0 && !name.includes("/") && !name.includes("..");
}

// GET /api/media — the library: every uploaded file, what it is called, what
// it shows, and the pages using it.
export async function GET() {
  const dir = join(process.cwd(), "public", "uploads");
  const files = await readdir(dir).catch(() => [] as string[]);
  const urls = files.map((f) => `/uploads/${f}`);
  const [usage, records] = await Promise.all([
    usageByUrl(urls),
    prisma.mediaFile.findMany({ where: { url: { in: urls } } }),
  ]);
  const byUrl = new Map(records.map((r) => [r.url, r]));

  return NextResponse.json(
    files.map((f) => {
      const url = `/uploads/${f}`;
      const record = byUrl.get(url);
      return {
        url,
        // A file uploaded before the library remembered names still lists
        // under the only name there is for it.
        name: displayName({ url, name: record?.name }),
        alt: record?.alt ?? "",
        usedOn: usage.get(url) ?? [],
      };
    }),
  );
}

// PATCH /api/media — rename a picture, or say what it shows.
// Body: { url, name?, alt? }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url: string = (body.url ?? "").toString();
  if (!isUploadUrl(url)) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });

  const files = await readdir(join(process.cwd(), "public", "uploads")).catch(() => [] as string[]);
  if (!files.includes(url.slice("/uploads/".length))) {
    return NextResponse.json({ error: "No such file" }, { status: 404 });
  }

  const name = typeof body.name === "string" ? cleanName(body.name) : undefined;
  const alt = typeof body.alt === "string" ? cleanAlt(body.alt) : undefined;
  if (name === undefined && alt === undefined) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  // A picture with no name at all is a wall of generated file names again.
  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "A picture needs a name." }, { status: 400 });
  }

  // The file keeps its URL: renaming here cannot break a page pointing at it.
  const record = await prisma.mediaFile.upsert({
    where: { url },
    update: { ...(name !== undefined ? { name } : {}), ...(alt !== undefined ? { alt } : {}) },
    create: {
      url,
      name: name ?? displayName({ url }),
      alt: alt ?? "",
    },
  });

  return NextResponse.json({ url: record.url, name: record.name, alt: record.alt });
}

// DELETE /api/media — delete a file (body: { url: "/uploads/file.png" })
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url: string = (body.url ?? "").toString();
  if (!isUploadUrl(url)) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  const name = url.slice("/uploads/".length);
  const filepath = join(process.cwd(), "public", "uploads", name);
  await unlink(filepath).catch(() => {});
  // What was known about the file goes with the file.
  await prisma.mediaFile.deleteMany({ where: { url } });
  return NextResponse.json({ ok: true });
}
