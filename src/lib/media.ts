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
  return stripFormatting(raw.replace(/[\\/]/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
}

/**
 * Control and format characters, out.
 *
 * A right-to-left override in a file name makes `photo\u202Egnp.exe` render as
 * `photo exe.png` in the picker: the characters are all there, in that order,
 * and the reader sees a different name from the one the file has. Nothing is
 * executed here — these are pictures, rendered through JSX, so there is no
 * XSS in it — but a person choosing a file is being shown something that is
 * not true, and that is the whole job of a media library.
 *
 * `\p{Cf}` is the Unicode class: the bidi overrides, the zero-width joiners,
 * the invisible separators. Normalised to NFC first so a decomposed name
 * compares and sorts the way it looks.
 */
function stripFormatting(raw: string): string {
  return raw
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\p{Cf}/gu, "");
}

/** A description: the same treatment, with room for a sentence. */
export function cleanAlt(raw: string): string {
  return stripFormatting(raw)
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
