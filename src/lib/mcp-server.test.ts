import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveSiteAccent, getTemplate } from "@/lib/templates";

const source = readFileSync(join(process.cwd(), "mcp-server.ts"), "utf8");

describe("resolveSiteAccent", () => {
  it("takes what was asked for", () => {
    expect(resolveSiteAccent("#ff0000", getTemplate("restaurant"))).toBe("#ff0000");
  });

  it("falls back to the template's own brand colour", () => {
    const restaurant = getTemplate("restaurant")!;
    expect(resolveSiteAccent(null, restaurant)).toBe(restaurant.accent);
    expect(resolveSiteAccent("  ", restaurant)).toBe(restaurant.accent);
  });

  it("falls back to the default for a blank site", () => {
    expect(resolveSiteAccent(undefined, null)).toBe("#6366f1");
  });
});

describe("the MCP server agrees with the app", () => {
  it("never deletes a site or page outright", () => {
    // An agent used to destroy a site through MCP — pages, history and form
    // submissions — while a person doing the same thing could undo it. Both
    // paths go through the trash now, and this fails if one drifts back.
    expect(source).not.toMatch(/prisma\.(site|page)\.delete\s*\(/);
    expect(source).toContain("trashSite(");
    expect(source).toContain("trashPage(");
  });

  it("creates sites on the same accent rule the web app uses", () => {
    expect(source).toContain("resolveSiteAccent(");
  });

  it("starts a new page the same way the New page dialog does", () => {
    // An agent's page used to be created with no content at all, which is the
    // blank page a person no longer gets. Both go through the same starter,
    // read off the same sibling pages.
    expect(source).toContain("startingContent(");
    expect(source).not.toMatch(/data: \{ siteId: site\.id, title, slug: finalSlug, sortOrder/);
  });

  it("resolves a template's links to the site it is creating", () => {
    // A template links between its own pages with a stand-in for the site
    // address. Left unresolved it ships `{{site}}/contact` into every page.
    expect(source).toContain("resolveSiteToken(");
  });

  it("shares the connection that sets WAL and a busy timeout", () => {
    // Its own bare PrismaClient had neither, so this was the side that threw
    // SQLITE_BUSY when the builder and an agent touched the file at once.
    expect(source).not.toMatch(/new PrismaClient\s*\(/);
    expect(source).toContain('from "./src/lib/prisma"');
  });
});
