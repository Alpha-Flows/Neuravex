import { describe, it, expect } from "vitest";
import { pageUrl, escapeXml, sitemapXml, robotsTxt } from "@/lib/seo";

describe("pageUrl", () => {
  it("gives the home page the site's own address", () => {
    expect(pageUrl("https://example.com", "acme", "index", true)).toBe("https://example.com/sites/acme");
  });

  it("puts every other page under it", () => {
    expect(pageUrl("https://example.com", "acme", "about", false)).toBe("https://example.com/sites/acme/about");
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(pageUrl("https://example.com/", "acme", "about", false)).toBe("https://example.com/sites/acme/about");
  });

  it("escapes a slug that would otherwise break the URL", () => {
    expect(pageUrl("", "acme", "a b&c", false)).toBe("/sites/acme/a%20b%26c");
  });
});

describe("escapeXml", () => {
  it("escapes the five characters XML cannot carry raw", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });
});

describe("sitemapXml", () => {
  it("writes a well-formed sitemap", () => {
    const xml = sitemapXml([
      { loc: "https://example.com/sites/acme", lastmod: new Date("2026-03-04T10:00:00Z"), priority: "1.0" },
      { loc: "https://example.com/sites/acme/about" },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://example.com/sites/acme</loc>");
    expect(xml).toContain("<lastmod>2026-03-04</lastmod>");
    expect(xml).toContain("<priority>1.0</priority>");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("leaves out what it was not given", () => {
    const xml = sitemapXml([{ loc: "https://example.com/x" }]);
    expect(xml).not.toContain("lastmod");
    expect(xml).not.toContain("priority");
  });

  it("escapes an address rather than emitting broken XML", () => {
    expect(sitemapXml([{ loc: "https://example.com/a?x=1&y=2" }])).toContain("a?x=1&amp;y=2");
  });

  it("is still valid with nothing in it", () => {
    expect(sitemapXml([])).toContain("</urlset>");
  });
});

describe("robotsTxt", () => {
  it("points crawlers at the sitemap once something is published", () => {
    const txt = robotsTxt(true, "https://example.com/sites/acme/sitemap.xml");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://example.com/sites/acme/sitemap.xml");
  });

  it("keeps a site with nothing published out of search results", () => {
    const txt = robotsTxt(false);
    expect(txt).toContain("Disallow: /");
    expect(txt).not.toContain("Sitemap:");
  });

  it("omits the sitemap line when there is no address to give", () => {
    // A downloaded folder: the directive needs a full address and there is
    // none yet, so the line is left out rather than written wrong.
    expect(robotsTxt(true)).not.toContain("Sitemap:");
  });
});
