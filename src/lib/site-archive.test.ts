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
  theme: "light",
  accent: "#059669",
  fontFamily: "Georgia, serif",
  headingFont: null,
  borderRadius: "1rem",
  headerBackground: "#101010",
  headerOpacity: 65,
  headerShape: "pill",
  headerPosition: "fixed",
  headerHtml: "<div>{name}</div>",
  footerHtml: null,
  customCss: ".x { color: red }",
  metaTitle: "Acme",
  metaDescription: "Things",
  ogImage: "/uploads/og.png",
  favicon: "/uploads/icon.png",
  language: "pt-BR",
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
      scheduledAt: null,
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
    expect(data.slug).toBeUndefined();
  });

  it("fills in a site that predates a setting rather than writing null", () => {
    const data = siteCreateData({ site: { name: "Old" } });
    expect(data.accent).toBe("#6366f1");
    expect(data.headerOpacity).toBe(80);
    expect(data.language).toBe("en");
    expect(data.theme).toBe("light");
  });

  it("survives a nameless archive", () => {
    expect(siteCreateData({}).name).toBe("Untitled site");
  });
});

describe("pageCreateData", () => {
  it("keeps the page's own content and SEO", () => {
    const data = pageCreateData(serializePage(site.pages[0]));
    expect(data.title).toBe("Home");
    expect(data.content).toBe('[{"id":"h","type":"heading"}]');
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
