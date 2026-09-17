import { test, expect, APIRequestContext, Page } from "@playwright/test";

const text = (id: string, label: string, align = "left") => ({
  id, type: "text", props: { text: label, align, size: "base", color: "" },
});
const section = (id: string, align: string, maxWidth: string, kids: unknown[]) => ({
  id, type: "section",
  props: { background: "#f1f5f9", paddingY: 24, paddingX: 24, maxWidth, align },
  children: kids,
});

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Wide ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  return { site, page: pages[0] };
}

/** Where the words actually begin, not where the box does. */
async function textStarts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const p of Array.from(document.querySelectorAll("main p"))) {
      const range = document.createRange();
      range.selectNodeContents(p);
      out[(p.textContent || "").trim()] = Math.round(range.getBoundingClientRect().left);
    }
    return out;
  });
}

test.describe("On a window far wider than the content", () => {
  test("everything left-aligned starts in the same place", async ({ page, request }) => {
    const { site } = await siteWith(request, [
      text("a", "straight on the page"),
      section("s1", "left", "site", [text("b", "in a section set to left")]),
      section("s2", "center", "site", [text("c", "in a section set to centre")]),
      section("s3", "right", "site", [text("d", "in a section set to right")]),
    ]);

    await page.setViewportSize({ width: 2560, height: 900 });
    await page.goto(`/sites/${site.slug}`);

    const starts = await textStarts(page);
    const values = Object.values(starts);
    // A block placed straight on the page used to start at x=0, hard against
    // the window; a section set to "right" put its left-aligned text at 1384.
    expect(new Set(values).size, JSON.stringify(starts)).toBe(1);
    expect(values[0]).toBeGreaterThan(100);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("the header, the page and the footer share one column", async ({ page, request }) => {
    const { site } = await siteWith(request, [text("a", "on the page")]);
    await page.setViewportSize({ width: 2560, height: 900 });
    await page.goto(`/sites/${site.slug}`);

    const edges = await page.evaluate(() => {
      const footers = document.querySelectorAll("footer");
      const at = (el: Element | null | undefined) => (el ? Math.round(el.getBoundingClientRect().left) : -1);
      return {
        logo: at(document.querySelector("header a")),
        body: at(document.querySelector("main p")),
        footer: at(footers[footers.length - 1]?.firstElementChild?.firstElementChild),
      };
    });
    expect(edges.body).toBe(edges.logo);
    expect(edges.footer).toBe(edges.logo);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("a section asked for edge to edge still spans the window", async ({ page, request }) => {
    const { site } = await siteWith(request, [section("s", "center", "full", [text("a", "edge to edge")])]);
    await page.setViewportSize({ width: 2560, height: 900 });
    await page.goto(`/sites/${site.slug}`);

    const width = await page.evaluate(
      () => Math.round(document.querySelector("main > div")!.getBoundingClientRect().width),
    );
    expect(width).toBe(2560);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The site's content width", () => {
  test("widens the whole page, header and all", async ({ page, request }) => {
    const { site } = await siteWith(request, [section("s", "center", "site", [text("a", "follows the site")])]);
    await page.setViewportSize({ width: 2560, height: 900 });

    const measure = async () =>
      page.evaluate(() => ({
        logo: Math.round(document.querySelector("header a")!.getBoundingClientRect().left),
        body: Math.round(document.querySelector("main p")!.getBoundingClientRect().left),
      }));

    await page.goto(`/sites/${site.slug}`);
    const standard = await measure();

    await request.patch(`/api/sites/${site.id}`, { data: { contentWidth: "96rem" } });
    await page.goto(`/sites/${site.slug}`);
    const wide = await measure();

    // Wider content means it starts further left, and the header comes with it.
    expect(wide.body).toBeLessThan(standard.body);
    expect(wide.logo).toBe(wide.body);

    await request.patch(`/api/sites/${site.id}`, { data: { contentWidth: "none" } });
    await page.goto(`/sites/${site.slug}`);
    const full = await measure();
    expect(full.body).toBeLessThan(wide.body);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The editor canvas", () => {
  test("puts a block on the page in the same column the visitor sees", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [text("a", "on the page")]);
    await page.setViewportSize({ width: 1600, height: 900 });

    await page.goto(`/sites/${site.slug}`);
    const published = await page.evaluate(() => {
      const el = document.querySelector("main p")!;
      return Math.round(el.getBoundingClientRect().width);
    });

    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);
    await page.waitForTimeout(600);
    const canvas = await page.evaluate(() => {
      const el = document.querySelector(".public-canvas p")!;
      return Math.round(el.getBoundingClientRect().width);
    });

    // The canvas is a narrower panel, so it cannot be wider than the page.
    expect(canvas).toBeLessThanOrEqual(published);
    expect(canvas).toBeGreaterThan(0);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("takes the room a large window gives it", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [text("a", "on the page")]);
    await page.setViewportSize({ width: 2560, height: 900 });
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);
    await page.waitForTimeout(600);

    const canvas = await page.evaluate(() => {
      const el = document.querySelector(".public-canvas")!.parentElement!;
      return Math.round(el.getBoundingClientRect().width);
    });
    // It used to stop at 1024px whatever the window, so on a large screen the
    // page was laid out at a width no visitor would see.
    expect(canvas).toBeGreaterThan(1300);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
