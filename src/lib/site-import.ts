/**
 * Bringing a site back from a backup, or from a JSON export, in the browser.
 *
 * The import route took the JSON and nothing else, with no button anywhere
 * that sent it. A backup is larger than any request the builder will read in
 * one piece — it holds the site's videos — so it is opened here instead: each
 * file goes up through the upload route, one at a time and checked exactly as
 * a file picked from the library is, and the archive then follows with its
 * addresses moved to where those files landed. No new way into the server,
 * and nothing it has not always been willing to take.
 */
import { sendUpload } from "./send-upload";
import { listZip, readZipEntry, type UnzipEntry } from "./unzip";
import { BACKUP_MEDIA, BACKUP_SITE, moveUploads, readBackupMedia } from "./site-backup";

export type ImportResult =
  | { ok: true; site: { id: string; slug: string; name: string }; files: number; missing: string[] }
  | { ok: false; error: string };

/** A site file, a backup `.zip` or a JSON export, made into a site. */
export async function importSiteFile(file: File, onProgress?: (words: string) => void): Promise<ImportResult> {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
  if (!isZip) return postArchive(await file.text(), 0, []);

  let entries: UnzipEntry[];
  try {
    entries = await listZip(file);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That zip could not be read." };
  }
  const siteEntry = entries.find((e) => e.path === BACKUP_SITE);
  if (!siteEntry) {
    return {
      ok: false,
      error:
        "That zip is not a Neuravex backup: there is no site.json in it. A zip from “Download files” is the site " +
        "to put online, and cannot be brought back into the builder.",
    };
  }
  const mediaEntry = entries.find((e) => e.path === BACKUP_MEDIA);
  let media = readBackupMedia([]);
  if (mediaEntry) {
    try {
      media = readBackupMedia(JSON.parse(await (await readZipEntry(file, mediaEntry)).text()));
    } catch {
      // Without it the files still come back, under their own names.
    }
  }

  // Pictures before the smaller copies of them, which are sent naming the
  // picture's new address.
  const copyOf = (entry: UnzipEntry) => media.find((m) => m.path === entry.path)?.variantOf ?? null;
  const files = entries
    .filter((e) => /^uploads\/[A-Za-z0-9._-]+$/.test(e.path))
    .sort((a, b) => Number(!!copyOf(a)) - Number(!!copyOf(b)));

  const moved = new Map<string, string>();
  const missing: string[] = [];
  for (const [i, entry] of files.entries()) {
    onProgress?.(`Bringing back file ${i + 1} of ${files.length}…`);
    const info = media.find((m) => m.path === entry.path);
    const name = entry.path.slice("uploads/".length);
    const parent = info?.variantOf ? moved.get(`/${info.variantOf}`) : undefined;
    // A copy of a picture that did not come back has nothing to be a copy of.
    if (info?.variantOf && !parent) continue;
    let sent;
    try {
      sent = await sendUpload(new File([await readZipEntry(file, entry)], name), parent ? { variantOf: parent } : {});
    } catch {
      sent = { ok: false as const, error: "" };
    }
    if (!sent.ok) {
      missing.push(info?.name || name);
      continue;
    }
    moved.set(`/${entry.path}`, sent.url);
    // The library's name and description for it, which the upload itself
    // cannot carry: it arrives under the name it had on disk.
    if (!parent && (info?.name || info?.alt)) {
      await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sent.url, ...(info.name ? { name: info.name } : {}), alt: info.alt }),
      }).catch(() => {});
    }
  }

  onProgress?.("Putting the pages back…");
  const json = moveUploads(await (await readZipEntry(file, siteEntry)).text(), moved);
  return postArchive(json, moved.size, missing);
}

async function postArchive(text: string, files: number, missing: string[]): Promise<ImportResult> {
  try {
    JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not a site backup or a site export." };
  }
  try {
    const res = await fetch("/api/sites/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
    const answer = await res.json().catch(() => null);
    if (!res.ok || typeof answer?.id !== "string") {
      return { ok: false, error: typeof answer?.error === "string" ? answer.error : "That site could not be imported." };
    }
    return { ok: true, site: { id: answer.id, slug: answer.slug, name: answer.name }, files, missing };
  } catch {
    return { ok: false, error: "That site could not be imported." };
  }
}
