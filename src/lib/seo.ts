/**
 * The things a published site needs before a search engine takes it
 * seriously: an address for every page, a sitemap listing them, and a
 * robots file pointing at it. None of this existed, so a site's inner pages
 * were discoverable only by following links from the home page.
 */

/** Where a page lives, absolute. The home page is the site's own address. */
export function pageUrl(origin: string, siteSlug: string, pageSlug: string, isHome: boolean): string {
  const base = `${origin.replace(/\/+$/, "")}/sites/${siteSlug}`;
  return isHome ? base : `${base}/${encodeURIComponent(pageSlug)}`;
}

/** XML text has five characters that cannot appear raw. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface SitemapEntry {
  loc: string;
  lastmod?: Date | string;
  priority?: string;
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((e) => {
    const lastmod =
      e.lastmod instanceof Date ? e.lastmod.toISOString() : e.lastmod ? new Date(e.lastmod).toISOString() : null;
    return [
      "  <url>",
      `    <loc>${escapeXml(e.loc)}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod.slice(0, 10)}</lastmod>`] : []),
      ...(e.priority ? [`    <priority>${e.priority}</priority>`] : []),
      "  </url>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * A site with nothing published asks not to be indexed at all — there is
 * nothing there to find, and a draft-only site should not be crawled.
 *
 * `sitemapUrl` is left out of a downloaded copy: the directive has to be a
 * full address, and where that folder ends up hosted is not known here.
 */
export function robotsTxt(hasPublishedPages: boolean, sitemapUrl?: string): string {
  if (!hasPublishedPages) {
    return ["User-agent: *", "Disallow: /", ""].join("\n");
  }
  const lines = ["User-agent: *", "Allow: /"];
  if (sitemapUrl) lines.push("", `Sitemap: ${sitemapUrl}`);
  return [...lines, ""].join("\n");
}
