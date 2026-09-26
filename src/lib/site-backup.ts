/**
 * What a backup of a site is: a zip holding the site's archive, the uploads
 * it uses, and what the library knew about each of them. Written by
 * `GET /api/sites/[id]/backup`, read back by `importSiteFile`.
 *
 * Shared by both ends, and dependency-free, so that the server writing one and
 * the browser reading it cannot disagree about where anything is.
 */

/** The archive, as the JSON export has always written it. */
export const BACKUP_SITE = "site.json";
/** The uploads' names, descriptions and copies; see `BackupMedia`. */
export const BACKUP_MEDIA = "media.json";

/** One upload in a backup, beside the file itself. */
export interface BackupMedia {
  /** Where the file is in the zip: `uploads/<name>`. */
  path: string;
  /** The name the library showed it under. */
  name: string;
  alt: string;
  /** For a smaller copy of a picture, the picture's own path in the zip. */
  variantOf: string | null;
}

export function BACKUP_README(siteName: string): string {
  return [
    `${siteName} — a Neuravex backup`,
    `Made on ${new Date().toISOString().slice(0, 10)}`,
    "",
    "This is not the site to put online: that is Download files, a folder of",
    "plain HTML. This is the site as the builder keeps it, to bring back into",
    "Neuravex on this computer or another — every page and setting, and the",
    "pictures, sounds, videos and fonts it uses.",
    "",
    "To bring it back: open Neuravex, and on the list of sites choose",
    '"Import a site", then this file.',
    "",
    "  site.json    the pages and settings",
    "  media.json   what the picture library knew about each file",
    "  uploads/     the files themselves",
    "",
  ].join("\n");
}

/**
 * The media list from a backup, repaired: only entries naming a file under
 * `uploads/`, and a copy only of a picture that is in the list too.
 */
export function readBackupMedia(raw: unknown): BackupMedia[] {
  if (!Array.isArray(raw)) return [];
  const isPath = (value: unknown): value is string =>
    typeof value === "string" && /^uploads\/[A-Za-z0-9._-]+$/.test(value) && !value.includes("..");
  const list = raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && isPath((m as Record<string, unknown>).path))
    .map((m) => ({
      path: m.path as string,
      name: typeof m.name === "string" ? m.name.slice(0, 200) : "",
      alt: typeof m.alt === "string" ? m.alt.slice(0, 1000) : "",
      variantOf: isPath(m.variantOf) ? m.variantOf : null,
    }));
  const paths = new Set(list.map((m) => m.path));
  return list.map((m) => (m.variantOf && !paths.has(m.variantOf) ? { ...m, variantOf: null } : m));
}

/**
 * The archive's text with every upload it names moved to the address the file
 * was given when it was brought back. An upload is stored under a name the
 * server makes up, so the same picture comes back under a new one; an address
 * with nothing to move to is left as it was.
 */
export function moveUploads(json: string, moved: Map<string, string>): string {
  return json.replace(/\/uploads\/[A-Za-z0-9._-]+/g, (address) => moved.get(address) ?? address);
}
