import { NextRequest, NextResponse } from "next/server";
import { readdir, unlink } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { cleanAlt, cleanName, displayName } from "@/lib/media";
import { uploadDirs, existingUploadPath, isUploadName } from "@/lib/uploads";
import { readJsonObject } from "@/lib/request-body";

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

  // Asked in SQL first, so pages that mention no upload at all are never read
  // into this process. The scan used to pull every page's full content on
  // every request — 5 ms at baseline, half a second across 27 MB of pages,
  // and page content had no size cap.
  const pages = await prisma.page.findMany({
    where: { OR: [{ content: { contains: "/uploads/" } }, { ogImage: { contains: "/uploads/" } }] },
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
  return isUploadName(url.slice("/uploads/".length));
}

/**
 * Every uploaded file, wherever it is kept, regular files only.
 *
 * A symbolic link dropped into the directory used to be listed here and
 * copied straight into the customer's download: `ln -s .env uploads/link.png`
 * put the environment file in both.
 */
async function uploadNames(): Promise<string[]> {
  const seen = new Set<string>();
  for (const dir of uploadDirs()) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile()) seen.add(entry.name);
    }
  }
  return [...seen].sort();
}

// GET /api/media — the library: every uploaded file, what it is called, what
// it shows, and the pages using it.
export async function GET() {
  const files = await uploadNames();
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
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const url: string = (body.url ?? "").toString();
  if (!isUploadUrl(url)) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });

  if (!existingUploadPath(url.slice("/uploads/".length))) {
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
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;

  const url: string = (parsed.body.url ?? "").toString();
  if (!isUploadUrl(url)) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  const filepath = existingUploadPath(url.slice("/uploads/".length));
  if (filepath) await unlink(filepath).catch(() => {});
  // What was known about the file goes with the file.
  await prisma.mediaFile.deleteMany({ where: { url } });
  return NextResponse.json({ ok: true });
}
