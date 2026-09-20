import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Latin letters that carry no accent of their own, so splitting them apart
 * leaves nothing behind. Without these, a Danish or German name loses a
 * letter rather than keeping its sound.
 */
const LATIN_LETTERS: Record<string, string> = {
  ß: "ss", æ: "ae", ø: "o", å: "a", œ: "oe", đ: "d", ð: "d",
  ł: "l", þ: "th", ħ: "h", ı: "i", ŋ: "n", ŧ: "t", ĸ: "k",
};

/**
 * A name reduced to plain lowercase letters: accents separated from their
 * letters and dropped, and the letters that carry no accent of their own
 * spelled out. "Café" is c-a-f-é; normalising splits the é into an e and an
 * accent, so dropping the accents leaves "cafe".
 *
 * Both the address a page is published at and the search over the picture
 * library are built on it, so typing "cafe" finds "Café" either way.
 */
export function foldAccents(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ßæøåœđðłþħıŋŧĸ]/g, (c) => LATIN_LETTERS[c] ?? c)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function slugify(input: string): string {
  // A site called "Résumé" used to be published at /r-sum, because every
  // letter the keyboard had dressed up was thrown away with its accent.
  return foldAccents(input)
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "") || "untitled";
}

export function uid(): string {
  // Lightweight unique id for client-side block creation (replaced by server id on save).
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
