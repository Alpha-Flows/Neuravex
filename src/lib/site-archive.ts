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

export const ARCHIVE_VERSION = 2;

/** Site columns that describe the site, excluding ids and timestamps. */
export const SITE_FIELDS = [
  "name",
  "slug",
  "description",
  "theme",
  "accent",
  "fontFamily",
  "headingFont",
  "borderRadius",
  "headerBackground",
  "headerOpacity",
  "headerShape",
  "headerPosition",
  "headerHtml",
  "footerHtml",
  "customCss",
  "metaTitle",
  "metaDescription",
  "ogImage",
  "favicon",
  "language",
] as const;

/** Page columns worth carrying. `scheduledAt` goes too, unused as it is. */
export const PAGE_FIELDS = [
  "title",
  "slug",
  "content",
  "published",
  "isHome",
  "sortOrder",
  "metaTitle",
  "metaDescription",
  "ogImage",
  "scheduledAt",
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
    site: pick(site, SITE_FIELDS),
    pages: site.pages.map((p) => serializePage(p, { includeHistory })),
  };
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
  theme: "light",
  accent: "#6366f1",
  headerBackground: "#ffffff",
  headerOpacity: 80,
  headerShape: "bar",
  headerPosition: "sticky",
  language: "en",
};

/** Everything but the slug, which the caller settles against what is taken. */
export type SiteCreateData = Row & { name: string; headerOpacity: number };

/** What Prisma needs to write the site back, minus the slug. */
export function siteCreateData(archive: { site?: Row }): SiteCreateData {
  const src = archive.site ?? {};
  const out: Row = {};
  for (const f of SITE_FIELDS) {
    if (f === "slug") continue;
    const value = src[f];
    out[f] = value === undefined || value === null ? SITE_DEFAULTS[f] ?? null : value;
  }
  return {
    ...out,
    name: String(out.name || "Untitled site"),
    // A number that arrived as a string would fail the write.
    headerOpacity: Number(out.headerOpacity ?? 80) || 0,
  };
}

export interface PageCreateData {
  title: string;
  slug: string;
  content: string;
  published: boolean;
  isHome: boolean;
  sortOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  scheduledAt: Date | null;
}

/** One page, ready to be written. Dates come back as dates. */
export function pageCreateData(page: Row): PageCreateData {
  return {
    title: String(page.title ?? "Untitled"),
    slug: String(page.slug ?? "page"),
    content: typeof page.content === "string" ? page.content : "[]",
    published: !!page.published,
    isHome: !!page.isHome,
    sortOrder: Number(page.sortOrder ?? 0) || 0,
    metaTitle: (page.metaTitle as string) ?? null,
    metaDescription: (page.metaDescription as string) ?? null,
    ogImage: (page.ogImage as string) ?? null,
    scheduledAt: page.scheduledAt ? new Date(page.scheduledAt as string) : null,
  };
}

/** True for anything shaped like one of our archives, including version 1. */
export function isSiteArchive(value: unknown): value is SiteArchive {
  const v = value as SiteArchive | null;
  return !!v && typeof v === "object" && !!(v.site as Row)?.name && Array.isArray(v.pages);
}
