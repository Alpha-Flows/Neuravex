import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { isStale, versionOf, VERSION_SELECT, type VersionedPage } from "@/lib/page-version";
import { AUTOSAVE_COALESCE_MS, cleanVersionName, decideRevisionAction, MAX_VERSION_NAME } from "@/lib/revisions";

/**
 * Two editors on one page, and the versions kept of it.
 *
 * Whichever of two tabs saved last used to win without a word, so the checks
 * below are on the order of things as much as on values: a stale save has to
 * be refused before anything is written, and a forced one has to keep what it
 * writes over.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a page's version", () => {
  const page = (over: Partial<VersionedPage> = {}): VersionedPage => ({
    title: "Home",
    slug: "index",
    content: JSON.stringify([
      { id: "h", type: "heading", props: { text: "Welcome" } },
      { id: "copy", type: "text", synced: "hours", props: { text: "Open daily" } },
    ]),
    published: true,
    isHome: true,
    isNotFound: false,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    language: null,
    isPost: false,
    postDate: null,
    author: null,
    excerpt: null,
    coverImage: null,
    tags: null,
    ...over,
  });

  it("is the same for the same page, and different once anything an editor writes changes", () => {
    expect(versionOf(page())).toBe(versionOf(page()));
    expect(versionOf(page({ title: "Start" }))).not.toBe(versionOf(page()));
    expect(versionOf(page({ published: false }))).not.toBe(versionOf(page()));
    expect(versionOf(page({ postDate: new Date("2026-01-01") }))).not.toBe(versionOf(page()));
    const edited = JSON.parse(page().content);
    edited[0].props.text = "Hello";
    expect(versionOf(page({ content: JSON.stringify(edited) }))).not.toBe(versionOf(page()));
  });

  it("does not move when a synced block changed elsewhere is written into this page's copy", () => {
    // The editor brings its copy up to date itself on its next save; see `settleSyncedBlocks`.
    const propagated = JSON.parse(page().content);
    propagated[1].props.text = "Open daily, nine to five";
    expect(versionOf(page({ content: JSON.stringify(propagated) }))).toBe(versionOf(page()));
    // Where the copy is is this page's own business, though.
    const moved = JSON.parse(page().content).reverse();
    expect(versionOf(page({ content: JSON.stringify(moved) }))).not.toBe(versionOf(page()));
  });

  it("is not about what no editor sends, like the order of the pages or the translation group", () => {
    const row = { ...page(), sortOrder: 4, translationGroup: "g1", updatedAt: new Date() };
    const later = { ...row, sortOrder: 9, translationGroup: "g2", updatedAt: new Date(Date.now() + 1000) };
    expect(versionOf(later)).toBe(versionOf(row));
  });

  it("is stale only when a version is named and is not the page's", () => {
    const now = versionOf(page());
    expect(isStale(page(), now)).toBe(false);
    expect(isStale(page({ title: "Start" }), now)).toBe(true);
    // An editor, a script or an agent that names no version is not checked.
    expect(isStale(page(), undefined)).toBe(false);
    expect(isStale(page(), "")).toBe(false);
    expect(isStale(page(), 1234)).toBe(false);
  });

  it("reads every field the save route writes", () => {
    const route = read("src/app/api/pages/[id]/save/route.ts");
    for (const field of Object.keys(VERSION_SELECT)) {
      if (["isPost", "postDate", "author", "excerpt", "coverImage", "tags"].includes(field)) continue;
      expect(route).toContain(field);
    }
    // The post fields arrive through `normalizePostFields`.
    expect(route).toContain("normalizePostFields(");
  });
});

describe("the save route", () => {
  const route = read("src/app/api/pages/[id]/save/route.ts");

  it("refuses a stale save before it writes anything", () => {
    const check = route.indexOf("if (isStale(page, body.baseVersion))");
    expect(check).toBeGreaterThan(-1);
    for (const write of ["prisma.page.update(", "prisma.page.updateMany(", "settleSyncedBlocks(", "snapshotRevision("]) {
      expect(route.indexOf(write)).toBeGreaterThan(check);
    }
    expect(route).toMatch(/conflict: true[\s\S]*status: 409/);
  });

  it("keeps the version it writes over when told to write anyway", () => {
    expect(route).toMatch(/if \(!body\.force\) \{[\s\S]*?\}\s*\/\/[\s\S]*?await keepAsVersion\(page\.id, \{ title: page\.title, content: page\.content/);
  });

  it("answers with the version the page is at once everything has been written", () => {
    expect(route).toMatch(/version: \(await currentVersion\(page\.id\)\) \?\? versionOf\(updated\)/);
  });
});

describe("the MCP server's save", () => {
  const source = read("mcp-server.ts");

  it("hands out the version with the page and refuses to save over a newer one", () => {
    expect(source).toMatch(/siteId: page\.siteId, version: versionOf\(page\), blocks/);
    expect(source).toMatch(/expectedVersion: z\.string\(\)\.optional\(\)/);
    const check = source.indexOf("if (isStale(page, expectedVersion))");
    expect(check).toBeGreaterThan(-1);
    expect(source.indexOf("prisma.page.update(", check)).toBeGreaterThan(check);
  });
});

describe("named versions", () => {
  const NOW = new Date("2026-01-01T12:00:00Z").getTime();
  const latest = { title: "Home", content: "[1]", manual: false, name: "Before the redesign", createdAt: new Date(NOW - 1000) };

  it("are never folded into by the autosave that follows", () => {
    expect(decideRevisionAction(latest, { title: "Home", content: "[2]", manual: false }, NOW)).toBe("create");
    expect(decideRevisionAction({ ...latest, name: null }, { title: "Home", content: "[2]", manual: false }, NOW)).toBe("replace");
    expect(AUTOSAVE_COALESCE_MS).toBeGreaterThan(1000);
  });

  it("are never pruned with the fifty-save window", () => {
    const source = read("src/lib/revisions.ts");
    expect(source).toMatch(/where: \{ pageId, name: null \},\s*orderBy: \{ createdAt: "desc" \},\s*skip: MAX_REVISIONS_PER_PAGE/);
  });

  it("have tidy names, or none", () => {
    expect(cleanVersionName("  Before   the\nredesign ")).toBe("Before the redesign");
    expect(cleanVersionName("   ")).toBeNull();
    expect(cleanVersionName(42)).toBeNull();
    expect(cleanVersionName("x".repeat(500))!.length).toBe(MAX_VERSION_NAME);
  });

  it("are what a restore keeps first, so the restore can be undone", () => {
    const source = read("src/lib/revisions.ts");
    const kept = source.indexOf("name: `Before restoring");
    const written = source.indexOf("prisma.page.update(", source.indexOf("export async function restoreRevision"));
    expect(kept).toBeGreaterThan(-1);
    expect(written).toBeGreaterThan(kept);
    expect(source).toMatch(/return \{ page: updated, undoRevisionId: before\.id \}/);
  });
});
