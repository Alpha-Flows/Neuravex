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
