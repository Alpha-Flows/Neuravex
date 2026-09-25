import { describe, it, expect } from "vitest";
import { absoluteHeadLinks, addressOf, basePathOf, cleanSiteUrl } from "@/lib/site-address";
import { normalizeSiteFields } from "@/lib/site-fields";
import { robotsTxt } from "@/lib/seo";

describe("a site's address", () => {
  it("is kept as scheme, host and folder, however it was typed", () => {
    expect(cleanSiteUrl("www.bakery.example")).toBe("https://www.bakery.example");
    expect(cleanSiteUrl(" https://bakery.example/ ")).toBe("https://bakery.example");
    expect(cleanSiteUrl("https://example.com/bakery/index.html")).toBe("https://example.com/bakery");
    expect(cleanSiteUrl("http://example.com/shop?x=1#top")).toBe("http://example.com/shop");
  });

  it("is refused when it is not a public web address", () => {
    for (const bad of ["", "javascript:alert(1)", "ftp://example.com", "https://user:pw@example.com", "localhost", "not a url"]) {
      expect(cleanSiteUrl(bad), bad).toBeNull();
    }
    expect(cleanSiteUrl(42)).toBeNull();
  });

  it("is stored repaired, with the other settings", () => {
    expect(normalizeSiteFields({ siteUrl: "bakery.example/", businessType: "Bakery" })).toEqual({
      siteUrl: "https://bakery.example",
      businessType: "Bakery",
    });
    expect(normalizeSiteFields({ siteUrl: "nope", businessType: "Spaceport" })).toEqual({ siteUrl: null, businessType: null });
  });

  it("names each file of the download, the home page as the folder itself", () => {
    expect(addressOf("https://bakery.example", "index.html")).toBe("https://bakery.example/");
    expect(addressOf("https://example.com/bakery", "about.html")).toBe("https://example.com/bakery/about.html");
    expect(basePathOf("https://example.com/bakery")).toBe("/bakery/");
    expect(basePathOf(null)).toBe("/");
  });

  it("makes the head's addresses full, and leaves the page's own links alone", () => {
    const html =
      '<html><head><link rel="canonical" href="about.html"/><link rel="alternate" hrefLang="de" href="about-de.html"/>' +
      '<link rel="alternate" type="application/atom+xml" href="feed.xml"/><meta property="og:image" content="uploads/a.webp"/>' +
      '<meta name="twitter:image" content="https://cdn.example/b.png"/><link rel="stylesheet" href="assets/site.css"></head>' +
      '<body><a href="contact.html">Contact</a></body></html>';
    const out = absoluteHeadLinks(html, "https://bakery.example");
    expect(out).toContain('<link rel="canonical" href="https://bakery.example/about.html"/>');
    expect(out).toContain('href="https://bakery.example/about-de.html"');
    expect(out).toContain('content="https://bakery.example/uploads/a.webp"');
    expect(out).toContain('content="https://cdn.example/b.png"');
    expect(out).toContain('type="application/atom+xml" href="feed.xml"');
    expect(out).toContain('href="assets/site.css"');
    expect(out).toContain('<a href="contact.html">');
  });

  it("points crawlers at the sitemap once it exists", () => {
    expect(robotsTxt(true, "https://bakery.example/sitemap.xml")).toContain("Sitemap: https://bakery.example/sitemap.xml");
    expect(robotsTxt(true)).not.toContain("Sitemap");
  });
});
