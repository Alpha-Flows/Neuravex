import { foldAccents } from "./utils";

/** The longest a name or description is worth keeping on one line. */
export const MAX_NAME = 120;
export const MAX_ALT = 300;

/** The generated file name an upload is stored under, e.g. "mu59seflqpe0.png". */
export function fileNameFromUrl(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1);
}

/**
 * What a person typed, made safe to store and to show on one line.
 *
 * A file arrives with whatever name the operating system gave it, which may
 * carry a path, a newline, or three hundred characters of nothing.
 */
export function cleanName(raw: string): string {
  return raw
    .replace(/[\\/]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
}

/** A description: the same treatment, with room for a sentence. */
export function cleanAlt(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ALT)
    .trim();
}

/**
 * The name to show for an upload: the one it arrived with, or that someone
 * typed over it, and the file's own name when neither is known — a library
 * that predates this record still has to list its files.
 */
export function displayName(file: { url: string; name?: string | null }): string {
  const named = file.name ? cleanName(file.name) : "";
  return named || fileNameFromUrl(file.url);
}

/**
 * Whether a picture answers to what was typed in the search box.
 *
 * Words are matched one at a time and in any order, so "sunset hero" finds
 * "Hero — sunset over the bay", and accents are folded on both sides, so
 * "cafe" finds a picture called "Café Noir". An empty box matches everything.
 */
export function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
  const words = foldAccents(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldAccents(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}
