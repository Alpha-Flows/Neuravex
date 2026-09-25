import { NextRequest, NextResponse } from "next/server";
import { lstat } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { serializeSite } from "@/lib/site-archive";
import { existingUploadPath } from "@/lib/uploads";
import { uploadAddresses } from "@/lib/image-plan";
import { zipStream, MAX_ZIP_BYTES, type ZipEntry, type ZipFileEntry } from "@/lib/zip";
import { BACKUP_MEDIA, BACKUP_README, BACKUP_SITE, type BackupMedia } from "@/lib/site-backup";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/backup — the site, and the files it uses, as one zip to
 * import again.
 *
 * The JSON export carried every page and setting and none of the pictures:
 * the pages named `/uploads/…` files that were on this machine and nowhere
 * else, so a site moved to a new computer by its own export arrived with every
 * picture broken, and so did a site restored from it after a disk died. This
 * carries the archive, each upload it names — with the smaller copies made of
 * it and what the library knows about it, its name and its description — and
 * a note saying what the file is for.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const site = await prisma.site.findUnique({
    where: { id: params.id },
    include: { pages: { orderBy: { sortOrder: "asc" } } },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const archive = serializeSite(site);
  const json = JSON.stringify(archive);

  // Every upload the site names anywhere — a block, a cover, the logo, a font
  // — and the copies made of those.
  const named = uploadAddresses(json);
  const records = await prisma.mediaFile.findMany({
    where: { OR: [{ url: { in: named } }, { variantOf: { in: named } }] },
    select: { url: true, name: true, alt: true, variantOf: true },
  });
  const urls = [...new Set([...named, ...records.map((r) => r.url)])];

  const entries: (ZipEntry | ZipFileEntry)[] = [{ path: BACKUP_SITE, data: Buffer.from(json, "utf8") }];
  const media: BackupMedia[] = [];
  for (const url of urls) {
    const name = url.slice("/uploads/".length);
    const file = existingUploadPath(name);
    if (!file) continue;
    // A regular file, never a link: see the same check in the download.
    const stats = await lstat(file).catch(() => null);
    if (!stats?.isFile()) continue;
    entries.push({ path: `uploads/${name}`, file, size: stats.size });
    const record = records.find((r) => r.url === url);
    media.push({
      path: `uploads/${name}`,
      name: record?.name ?? "",
      alt: record?.alt ?? "",
      variantOf: record?.variantOf ? `uploads/${record.variantOf.slice("/uploads/".length)}` : null,
    });
  }
  entries.push({ path: BACKUP_MEDIA, data: Buffer.from(JSON.stringify(media), "utf8") });
  entries.push({ path: "README.txt", data: Buffer.from(BACKUP_README(site.name), "utf8") });

  const zip = zipStream(entries);
  if (!zip) {
    return NextResponse.json(
      {
        error: `This site and its files come to more than ${Math.floor(MAX_ZIP_BYTES / 1024 ** 3)} GB, more than one backup can hold.`,
      },
      { status: 413 },
    );
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(zip.stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${site.slug}-backup-${stamp}.zip"`,
      "content-length": String(zip.length),
    },
  });
}
