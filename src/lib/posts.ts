/**
 * Blog posts: pages with a date, an author, a cover, a line or two of
 * summary and some tags, listed newest first.
 *
 * The Journal and Podcast templates look like blogs, and every post on them
 * was a page built by hand: the date typed into a paragraph, the list of
 * posts on the front page a set of cards somebody had to add to and reorder
 * each time, and no feed, so nobody could follow the site from a reader. A
 * page can be a post now. It keeps everything a page has — blocks, address,
 * history, SEO — and gains the post's details, which the page draws as a
 * header above its blocks; the posts block lists them; the site's feed
 * carries them; and the menu leaves them out, since a menu with every post
 * in it is not a menu.
 *
 * Dependency-light: the editor, the published page and the feed all read
 * this.
 */
import { isSafeHref } from "./url-safety";

export const POST_LIMITS = { author: 120, excerpt: 400, tag: 40, tags: 10 } as const;

/** A post as a list of posts, a post header and the feed need it. */
export interface PostItem {
  id: string;
  slug: string;
  title: string;
  href: string;
  /** ISO date-time. */
  date: string;
  author: string;
  excerpt: string;
  coverImage: string;
  tags: string[];
}

/** Tags from what was typed: split on commas, tidied, each once, ten at most. */
export function cleanTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out: string[] = [];
  for (const item of list) {
    const tag = typeof item === "string" ? item.replace(/\s+/g, " ").trim().slice(0, POST_LIMITS.tag) : "";
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
    if (out.length >= POST_LIMITS.tags) break;
  }
  return out;
}

/**
 * A post's date from what the date field sends, `2026-09-25`, as noon UTC on
 * that day — noon so that no time zone between here and the reader turns it
 * into the day before. Null for anything that is not a date.
 */
export function postDateFrom(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12)) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A date as the date field shows it. */
export function postDateInput(date: Date | string | null | undefined): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/** A post's date as a reader sees it, in the site's language — "25 September 2026". */
export function formatPostDate(iso: string, language = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString(language, { dateStyle: "long", timeZone: "UTC" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** A cover picture's address, when it is one a picture can be at. */
function coverOf(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const href = isSafeHref(value.trim());
  return href && href.length <= 2000 && /^(?:\/(?!\/)|https?:\/\/)/i.test(href) ? href : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || null : null;
}

/**
 * The post fields a save carries, repaired: only the ones present, each in
 * the shape the database keeps. A field sent empty is cleared.
 */
export function normalizePostFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof input.isPost === "boolean") out.isPost = input.isPost;
  if (input.postDate !== undefined) out.postDate = postDateFrom(input.postDate);
  if (input.author !== undefined) out.author = text(input.author, POST_LIMITS.author);
  if (input.excerpt !== undefined) out.excerpt = text(input.excerpt, POST_LIMITS.excerpt);
  if (input.coverImage !== undefined) out.coverImage = coverOf(input.coverImage);
  if (input.tags !== undefined) {
    const tags = cleanTags(input.tags);
    out.tags = tags.length > 0 ? tags.join(", ") : null;
  }
  return out;
}

/** The fields of a page row that make it a post. */
export interface PostRow {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  isPost: boolean;
  postDate: Date | string | null;
  author: string | null;
  excerpt: string | null;
  coverImage: string | null;
  tags: string | null;
  createdAt?: Date | string;
}

/** A site's posts, newest first, as the list and the feed use them. */
export function postItems(pages: PostRow[], siteSlug: string): PostItem[] {
  return pages
    .filter((p) => p.isPost)
    .map((p) => {
      const when = p.postDate ?? p.createdAt ?? new Date(0);
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        href: p.isHome ? `/sites/${siteSlug}` : `/sites/${siteSlug}/${p.slug}`,
        date: new Date(when).toISOString(),
        author: p.author ?? "",
        excerpt: p.excerpt ?? "",
        coverImage: coverOf(p.coverImage) ?? "",
        tags: cleanTags(p.tags ?? ""),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));
}
