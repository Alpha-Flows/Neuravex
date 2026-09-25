/**
 * A site, whole, as JSON.
 *
 * Used by the JSON export, by import, and by the trash — deleting a site puts
 * one of these away so it can be put back.
 *
 * The old export format listed fields by hand and had fallen behind the
 * schema: header styling, per-page SEO and the site's own SEO image were all
 * dropped, so "export and re-import" quietly returned a different site from
 * the one that went in. Everything the schema carries is listed here, and a
 * test fails when a field is added to the schema and not to this file.
 */

import { isLegalKind } from "./legal/pages";
import { normalizeSiteFields } from "./site-fields";
import { normalizeBlockTreeJson, clampSortOrder } from "./block-tree";
import { slugify } from "./utils";
import { menuForArchive } from "./menu";
import { normalizePostFields } from "./posts";

export const ARCHIVE_VERSION = 3;

/** Site columns that describe the site, excluding ids and timestamps. */
export const SITE_FIELDS = [
  "name",
  "slug",
  "description",
  "accent",
  "palette",
  "fontFamily",
  "headingFont",
  "fonts",
  "textStyles",
  "borderRadius",
  "contentWidth",
  "headerBackground",
  "headerOpacity",
  "headerShape",
  "headerPosition",
  "logo",
  "menu",
  "footer",
  "headerHtml",
  "footerHtml",
  "customCss",
  "metaTitle",
  "metaDescription",
  "ogImage",
  "favicon",
  "language",
  "legal",
] as const;

/** Page columns worth carrying. */
export const PAGE_FIELDS = [
  "title",
  "slug",
  "content",
  "published",
  "isHome",
  "isNotFound",
  "isPost",
  "postDate",
  "author",
  "excerpt",
  "coverImage",
  "tags",
  "sortOrder",
  "metaTitle",
  "metaDescription",
  "ogImage",
  "legalKind",
] as const;

type Row = Record<string, unknown>;

export interface PageArchive extends Row {
  revisions?: { title: string; content: string; manual: boolean; createdAt: string }[];
  submissions?: { data: string; createdAt: string }[];
}

export interface SiteArchive {
  version: number;
  exportedAt: string;
  site: Row;
  pages: PageArchive[];
}

function pick(row: Row, fields: readonly string[]): Row {
  const out: Row = {};
  for (const f of fields) {
    const value = row[f];
    out[f] = value instanceof Date ? value.toISOString() : value ?? null;
  }
  return out;
}

export interface SerializeOptions {
  /** History and form submissions ride along for the trash, not for an export. */
  includeHistory?: boolean;
}

export function serializeSite(
  site: Row & { pages: Row[] },
  { includeHistory = false }: SerializeOptions = {},
): SiteArchive {
  return {
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    site: archiveSite(site),
    pages: site.pages.map((p) => serializePage(p, { includeHistory })),
  };
}

/**
 * The site's own fields, with its menu naming pages by slug rather than id.
 *
 * A page's id is not kept across an import — the pages are created afresh —
 * so a menu that named its pages by id came back naming pages that were not
 * there, and every one of them was dropped to the end of the menu with its
 * label lost. A slug is kept, and the menu reads either.
 */
function archiveSite(site: Row & { pages: Row[] }): Row {
  const out = pick(site, SITE_FIELDS);
  if (typeof out.menu === "string") {
    const pages = site.pages.flatMap((p) => (typeof p.id === "string" && typeof p.slug === "string" ? [{ id: p.id, slug: p.slug }] : []));
    out.menu = JSON.stringify(menuForArchive(out.menu, pages));
  }
  return out;
}

export function serializePage(page: Row, { includeHistory = false }: SerializeOptions = {}): PageArchive {
  const out: PageArchive = pick(page, PAGE_FIELDS);
  if (includeHistory) {
    const revisions = (page.revisions as Row[] | undefined) ?? [];
    const submissions = (page.submissions as Row[] | undefined) ?? [];
    out.revisions = revisions.map((r) => ({
      title: String(r.title ?? "Untitled"),
      content: String(r.content ?? "[]"),
      manual: !!r.manual,
      createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date()).toISOString(),
    }));
    out.submissions = submissions.map((s) => ({
      data: String(s.data ?? "{}"),
      createdAt: (s.createdAt instanceof Date ? s.createdAt : new Date()).toISOString(),
    }));
  }
  return out;
}

const SITE_DEFAULTS: Row = {
  accent: "#6366f1",
  headerBackground: "#ffffff",
  headerOpacity: 80,
  headerShape: "bar",
  headerPosition: "sticky",
  language: "en",
};

/** Everything but the slug, which the caller settles against what is taken. */
export type SiteCreateData = Row & { name: string; headerOpacity: number };

/**
 * What Prisma needs to write the site back, minus the slug.
 *
 * Every field goes through the same `normalizeSiteFields()` the settings API
 * uses. Import used to copy the archive verbatim — the one writer in the app
 * that validated nothing — so an archive could set `headerShape: "<b>x"`,
 * `headerOpacity: 999` and, the one that mattered, an accent carrying a second
 * CSS declaration that then rendered on the builder's own dashboard.
 */
export function siteCreateData(archive: { site?: Row }): SiteCreateData {
  const src = archive.site ?? {};
  const raw: Row = {};
  for (const f of SITE_FIELDS) {
    if (f === "slug") continue;
    const value = src[f];
    raw[f] = value === undefined || value === null ? SITE_DEFAULTS[f] ?? null : value;
  }

  const out = normalizeSiteFields(raw, { complete: true });
  return {
    ...out,
    name: String(out.name || "Untitled site"),
    headerOpacity: typeof out.headerOpacity === "number" ? out.headerOpacity : 80,
  };
}

export interface PageCreateData {
  title: string;
  slug: string;
  content: string;
  published: boolean;
  isHome: boolean;
  /** The site's "not found" page; one per site, like the home page. */
  isNotFound: boolean;
  /** A blog post, and its details; see `lib/posts.ts`. */
  isPost: boolean;
  postDate: Date | null;
  author: string | null;
  excerpt: string | null;
  coverImage: string | null;
  tags: string | null;
  sortOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  /** "impressum" or "datenschutz" on a generated legal page; null otherwise. */
  legalKind: string | null;
}

function optional(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) || null : null;
}

/**
 * One page, ready to be written. Dates come back as dates.
 *
 * Every other writer in the app slugifies and guards `isHome`; this one stored
 * what the archive said. An archive with a raw slug such as `About Us`
 * produced a page linked from the nav and unreachable at every encoding, a
 * download that answered 502, and — because the `{legal}` footer substitution
 * builds an href out of the raw slug — a slug that could close the attribute
 * it was written into. `normalizeArchivePages()` below is what settles the
 * cross-page rules; this settles one page.
 */
export function pageCreateData(page: Row): PageCreateData {
  const tree = normalizeBlockTreeJson(typeof page.content === "string" ? page.content : []);
  return {
    title: String(page.title ?? "Untitled").slice(0, 300),
    slug: slugify(String(page.slug ?? "page")) || "page",
    // An unreadable tree becomes an empty page rather than failing the whole
    // import: the rest of the archive is still worth having, and an empty
    // page is something the owner can see and fix.
    content: tree.ok ? tree.json : "[]",
    published: !!page.published,
    isHome: !!page.isHome,
    isNotFound: !!page.isNotFound,
    // Repaired the way a save repairs them, since an archive can say anything.
    isPost: !!page.isPost,
    ...(normalizePostFields({
      postDate: page.postDate ?? null,
      author: page.author ?? null,
      excerpt: page.excerpt ?? null,
      coverImage: page.coverImage ?? null,
      tags: page.tags ?? null,
    }) as Pick<PageCreateData, "postDate" | "author" | "excerpt" | "coverImage" | "tags">),
    sortOrder: clampSortOrder(Number(page.sortOrder ?? 0)) ?? 0,
    metaTitle: optional(page.metaTitle, 1000),
    metaDescription: optional(page.metaDescription, 1000),
    ogImage: optional(page.ogImage, 2000),
    // An imported site keeps the link between its details and its legal
    // pages, so re-importing does not turn the Impressum into an ordinary
    // page that the footer can no longer find.
    legalKind: isLegalKind(page.legalKind) ? page.legalKind : null,
  };
}

/** How many pages one archive may carry. */
export const MAX_ARCHIVE_PAGES = 500;

/**
 * Every page in an archive, with the rules that span pages settled.
 *
 * Nothing used to check these across the archive, so one import could produce
 * two home pages — both exported as `index.html`, the second renamed
 * `index-2.html` and holding the same content — two Impressum pages both
 * linked in the footer, and two pages fighting over one slug.
 */
export function normalizeArchivePages(pages: Row[]): PageCreateData[] {
  const taken = new Set<string>();
  const legalTaken = new Set<string>();
  let homeTaken = false;
  let notFoundTaken = false;

  return pages.slice(0, MAX_ARCHIVE_PAGES).map((page) => {
    const data = pageCreateData(page);

    let slug = data.slug;
    let suffix = 0;
    while (taken.has(slug)) {
      suffix += 1;
      slug = `${data.slug}-${suffix}`;
    }
    taken.add(slug);
    data.slug = slug;

    if (data.isHome && homeTaken) data.isHome = false;
    else if (data.isHome) homeTaken = true;

    if (data.isNotFound && notFoundTaken) data.isNotFound = false;
    else if (data.isNotFound) notFoundTaken = true;

    if (data.legalKind) {
      if (legalTaken.has(data.legalKind)) data.legalKind = null;
      else legalTaken.add(data.legalKind);
    }

    return data;
  });
}

/** True for anything shaped like one of our archives, including version 1. */
export function isSiteArchive(value: unknown): value is SiteArchive {
  const v = value as SiteArchive | null;
  return !!v && typeof v === "object" && !!(v.site as Row)?.name && Array.isArray(v.pages);
}
