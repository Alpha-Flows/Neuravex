import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { TEMPLATES } from "./templates";

const PUBLIC_DIR = join(process.cwd(), "public");

/** Everything a template puts on a page, as one string per template. */
const serialised = TEMPLATES.map((t) => ({ id: t.id, json: JSON.stringify(t.pages) }));

describe("what a template puts on the page", () => {
  it("never shows a picture as the word for an object", () => {
    // Two templates built their hero background with url('${IMG.abstract}')
    // instead of IMG.abstract.src. A StockImage became "[object Object]", so
    // the AI Upscaler templates opened with an empty gradient where the
    // before-and-after photograph belongs — in the canvas, on the published
    // page, and in the downloaded copy — and every visit asked the host for
    // a file called "[object Object]".
    for (const { id, json } of serialised) {
      expect(json, `template "${id}"`).not.toContain("[object Object]");
      expect(json, `template "${id}"`).not.toContain("undefined");
    }
  });

  it("only points at pictures that ship with the app", () => {
    // Templates used to reach for images on the internet, which left a hero
    // blank on a machine with no network. They are bundled now, so a path
    // that no longer exists has to fail here rather than on the page.
    const missing: string[] = [];
    for (const { id, json } of serialised) {
      for (const match of json.matchAll(/\/(?:stock|uploads)\/[^"')\s\\]+/g)) {
        if (!existsSync(join(PUBLIC_DIR, match[0]))) missing.push(`${id}: ${match[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives every template a picture-free way to be identified", () => {
    for (const t of TEMPLATES) {
      expect(t.id, "template id").toMatch(/^[a-z0-9-]+$/);
      expect(t.name.trim().length, `template "${t.id}" name`).toBeGreaterThan(0);
      expect(t.pages.length, `template "${t.id}" pages`).toBeGreaterThan(0);
    }
  });
});

describe("a template with more than one page", () => {
  it("links only to pages it actually has", () => {
    // A template writes a link to its own pages as a stand-in for the site
    // address, resolved when a site is created. A stand-in pointing at a slug
    // no page in the template carries would ship a 404 into every site made
    // from it.
    const broken: string[] = [];
    for (const template of TEMPLATES) {
      const slugs = new Set(template.pages.map((p) => p.slug));
      const home = template.pages.find((p) => p.isHome);
      for (const match of JSON.stringify(template.pages).matchAll(/\{\{site\}\}(\/[a-z0-9-]*)?/g)) {
        const slug = match[1]?.slice(1);
        // The bare stand-in is the home page, which every template has.
        if (!slug) {
          if (!home) broken.push(`${template.id}: links home, but has no home page`);
          continue;
        }
        if (!slugs.has(slug)) broken.push(`${template.id}: links to /${slug}, which it has no page for`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("gives every page a slug of its own", () => {
    for (const template of TEMPLATES) {
      const slugs = template.pages.map((p) => p.slug);
      expect(new Set(slugs).size, `template "${template.id}" slugs`).toBe(slugs.length);
      for (const slug of slugs) expect(slug, `template "${template.id}"`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every template exactly one home page", () => {
    for (const template of TEMPLATES) {
      expect(template.pages.filter((p) => p.isHome).length, `template "${template.id}"`).toBe(1);
    }
  });
});

describe("the colours a template paints with", () => {
  it("writes every section background as a colour a browser understands", () => {
    // Seven sections were written `#transparent`, which is not a colour: the
    // browser drops the declaration, so it happened to look right, and every
    // piece of code that reads a background had to be taught to survive it.
    const bad: string[] = [];
    const walk = (blocks: unknown[], id: string) => {
      for (const block of blocks as { type?: string; props?: Record<string, unknown>; children?: unknown[] }[]) {
        const background = block.props?.background;
        if (typeof background === "string" && background && background !== "transparent") {
          if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(background)) bad.push(`${id}: ${background}`);
        }
        if (block.children) walk(block.children, id);
      }
    };
    for (const template of TEMPLATES) template.pages.forEach((p) => walk(p.blocks, template.id));
    expect(bad).toEqual([]);
  });
});
