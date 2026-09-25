import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  SITE_FIELDS,
  PAGE_FIELDS,
  serializeSite,
  serializePage,
  siteCreateData,
  pageCreateData,
  isSiteArchive,
  ARCHIVE_VERSION,
  normalizeArchivePages,
  MAX_ARCHIVE_PAGES,
} from "@/lib/site-archive";

/** Field names declared on one model in the Prisma schema. */
function schemaFields(model: string): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const body = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@") && !line.startsWith("///"))
    .map((line) => line.split(/\s+/)[0]);
}

// Ids, timestamps and relations are rebuilt rather than carried.
const NOT_CARRIED = new Set([
  "id", "siteId", "site", "pageId", "page", "createdAt", "updatedAt",
  "pages", "revisions", "submissions",
]);

describe("the archive keeps up with the schema", () => {
  it("carries every field of Site that describes the site", () => {
    const missing = schemaFields("Site").filter(
      (f) => !NOT_CARRIED.has(f) && !(SITE_FIELDS as readonly string[]).includes(f),
    );
    // The old export listed fields by hand and fell behind: header styling and
    // the SEO image were dropped, so a re-import gave back a different site.
    expect(missing).toEqual([]);
  });

  it("carries every field of Page that describes the page", () => {
    const missing = schemaFields("Page").filter(
      (f) => !NOT_CARRIED.has(f) && !(PAGE_FIELDS as readonly string[]).includes(f),
    );
    expect(missing).toEqual([]);
  });
});

const site = {
  id: "s1",
  name: "Acme",
  slug: "acme",
  description: "A site",
  accent: "#059669",
  palette: '["#0f172a","","#f59e0b"]',
  fontFamily: "Georgia, serif",
  headingFont: null,
  fonts: '[{"family":"Acme Sans","url":"/uploads/acme.woff2","weight":"400","style":"normal","category":"sans"}]',
  textStyles: '{"h1":52,"body":18}',
  borderRadius: "1rem",
  contentWidth: "80rem",
  headerBackground: "#101010",
  headerOpacity: 65,
  headerShape: "pill",
  headerPosition: "fixed",
  logo: '{"src":"/uploads/logo.png","height":32,"withName":false}',
  menu: '[{"kind":"link","label":"Shop","href":"https://shop.example.com"}]',
  footer: '{"about":"Things since 1990.","columns":[],"contact":{"address":"","phone":"","email":""},"social":[],"copyright":"","background":""}',
  headerHtml: "<div>{name}</div>",
  footerHtml: null,
  customCss: ".x { color: red }",
  metaTitle: "Acme",
  metaDescription: "Things",
  ogImage: "/uploads/og.png",
  favicon: "/uploads/icon.png",
  language: "pt-BR",
  legal: '{"version":1,"companyName":"Acme GmbH"}',
  createdAt: new Date(),
  updatedAt: new Date(),
  pages: [
    {
      id: "p1",
      title: "Home",
      slug: "index",
      content: '[{"id":"h","type":"heading"}]',
      published: true,
      isHome: true,
      sortOrder: 0,
      metaTitle: "Home | Acme",
      metaDescription: null,
      ogImage: null,
      legalKind: null,
      revisions: [{ title: "Home", content: "[]", manual: true, createdAt: new Date("2026-01-02T03:04:05Z") }],
      submissions: [{ data: '{"field-0":"hi"}', createdAt: new Date("2026-01-02T03:04:05Z") }],
    },
  ],
};

describe("serializeSite", () => {
  it("round-trips every setting, not just the ones someone remembered", () => {
    const archive = serializeSite(site);
    expect(archive.version).toBe(ARCHIVE_VERSION);
    for (const f of SITE_FIELDS) {
      expect(archive.site[f], f).toEqual((site as Record<string, unknown>)[f]);
    }
    expect(archive.pages[0].metaTitle).toBe("Home | Acme");
  });

  it("names the menu's pages by slug, since an import gives every page a new id", () => {
    const withMenu = { ...site, menu: JSON.stringify([{ kind: "page", page: "p1", label: "Start" }, { kind: "link", label: "Shop", href: "https://shop.example.com" }]) };
    const archived = JSON.parse(serializeSite(withMenu).site.menu as string);
    expect(archived).toEqual([
      { kind: "page", page: "index", label: "Start" },
      { kind: "link", label: "Shop", href: "https://shop.example.com" },
    ]);
  });

  it("keeps a generated legal page tied to its kind", () => {
    // Without this an exported and re-imported site would come back with the
    // Impressum as an ordinary page, out of the footer and into the nav.
    const withLegal = {
      ...site,
      pages: [...site.pages, { ...site.pages[0], id: "p2", slug: "impressum", legalKind: "impressum" }],
    };
    const archive = serializeSite(withLegal);
    expect(archive.pages[1].legalKind).toBe("impressum");
    expect(pageCreateData(archive.pages[1]).legalKind).toBe("impressum");
    // Anything else on that field is not a kind this app knows how to own.
    expect(pageCreateData({ ...archive.pages[0], legalKind: "nonsense" }).legalKind).toBeNull();
  });

  it("leaves history out of an export and puts it in a trashed copy", () => {
    expect(serializeSite(site).pages[0].revisions).toBeUndefined();

    const kept = serializeSite(site, { includeHistory: true });
    expect(kept.pages[0].revisions).toHaveLength(1);
    expect(kept.pages[0].submissions?.[0].data).toBe('{"field-0":"hi"}');
  });

  it("writes dates as strings so the archive is plain JSON", () => {
    const archive = serializeSite(site, { includeHistory: true });
    expect(typeof archive.pages[0].revisions![0].createdAt).toBe("string");
    expect(JSON.parse(JSON.stringify(archive))).toEqual(archive);
  });
});

describe("siteCreateData", () => {
  it("gives back what went in", () => {
    const data = siteCreateData(serializeSite(site));
    expect(data.name).toBe("Acme");
    expect(data.headerShape).toBe("pill");
    expect(data.headerOpacity).toBe(65);
    expect(data.language).toBe("pt-BR");
    expect(data.favicon).toBe("/uploads/icon.png");
    expect(data.contentWidth).toBe("80rem");
    expect(data.slug).toBeUndefined();
  });

  it("fills in a site that predates a setting rather than writing null", () => {
    const data = siteCreateData({ site: { name: "Old" } });
    expect(data.accent).toBe("#6366f1");
    expect(data.headerOpacity).toBe(80);
    expect(data.language).toBe("en");
    expect(data.headerShape).toBe("bar");
  });

  it("survives a nameless archive", () => {
    expect(siteCreateData({}).name).toBe("Untitled site");
  });
});

describe("pageCreateData", () => {
  it("keeps the page's own content and SEO", () => {
    const data = pageCreateData(serializePage(site.pages[0]));
    expect(data.title).toBe("Home");
    // The tree goes through the same validator every other writer uses, so a
    // block arrives with the props its type says it has rather than with
    // whatever the archive happened to carry.
    const blocks = JSON.parse(data.content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: "h", type: "heading" });
    expect(blocks[0].props.level).toBe(2);
    expect(data.isHome).toBe(true);
    expect(data.metaTitle).toBe("Home | Acme");
  });

  it("falls back for a page with nothing in it", () => {
    const data = pageCreateData({});
    expect(data.title).toBe("Untitled");
    expect(data.content).toBe("[]");
    expect(data.published).toBe(false);
  });
});

describe("isSiteArchive", () => {
  it("accepts our own output and a version 1 export", () => {
    expect(isSiteArchive(serializeSite(site))).toBe(true);
    expect(isSiteArchive({ version: 1, site: { name: "Old" }, pages: [] })).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of [null, undefined, {}, { site: {} }, { site: { name: "x" } }, "text"]) {
      expect(isSiteArchive(bad)).toBe(false);
    }
  });
});

describe("an archive is not a trusted writer", () => {
  it("slugifies a page slug, like every other writer does", () => {
    // `About Us` was stored raw: linked from the nav, unreachable at every
    // encoding, and a 502 from the download.
    expect(pageCreateData({ slug: "About Us" }).slug).toBe("about-us");
  });

  it("clamps a sortOrder the column cannot hold", () => {
    // 1e12 went into a 32-bit Int. SQLite stored it; every later read threw.
    expect(pageCreateData({ sortOrder: 1e12 }).sortOrder).toBe(2 ** 31 - 1);
    expect(pageCreateData({ sortOrder: -5 }).sortOrder).toBe(0);
  });

  it("refuses a javascript: href inside an imported block", () => {
    const data = pageCreateData({
      content: JSON.stringify([
        { id: "b", type: "button", props: { label: "Go", href: "javascript:alert(1)" } },
      ]),
    });
    expect(data.content).not.toContain("javascript:");
  });

  it("refuses an accent that carries a second declaration", () => {
    const data = siteCreateData({
      site: { name: "x", accent: "#fff 0%, #000 100%);background-image:url(https://attacker.example/p);/*" },
    });
    expect(data.accent).toBe("#6366f1");
  });

  it("clamps headerOpacity and drops an invented headerShape", () => {
    const data = siteCreateData({ site: { name: "x", headerOpacity: 999, headerShape: "<b>x" } });
    expect(data.headerOpacity).toBe(100);
    expect(data.headerShape).toBe("bar");
  });

  it("refuses a language that is not one", () => {
    expect(siteCreateData({ site: { name: "x", language: '"><script>' } }).language).toBe("en");
  });
});

describe("normalizeArchivePages", () => {
  it("keeps one home page", () => {
    const pages = normalizeArchivePages([
      { slug: "a", isHome: true },
      { slug: "b", isHome: true },
    ]);
    expect(pages.filter((p) => p.isHome)).toHaveLength(1);
  });

  it("de-duplicates slugs that collide after slugifying", () => {
    const pages = normalizeArchivePages([{ slug: "About Us" }, { slug: "about-us" }]);
    expect(pages.map((p) => p.slug)).toEqual(["about-us", "about-us-1"]);
  });

  it("keeps one page per legal kind, so the footer links one Impressum", () => {
    const pages = normalizeArchivePages([
      { slug: "a", legalKind: "impressum" },
      { slug: "b", legalKind: "impressum" },
    ]);
    expect(pages.map((p) => p.legalKind)).toEqual(["impressum", null]);
  });

  it("stops at the page cap", () => {
    const many = Array.from({ length: MAX_ARCHIVE_PAGES + 50 }, (_, i) => ({ slug: `p${i}` }));
    expect(normalizeArchivePages(many)).toHaveLength(MAX_ARCHIVE_PAGES);
  });
});
