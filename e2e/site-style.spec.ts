import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { readFromZip } from "./zip";

/**
 * The site's own palette and text sizes, and the gradient a section or a
 * column can be filled with — each set once, drawn the same on the canvas,
 * the published page and in the download.
 */

async function siteWith(request: APIRequestContext, content: unknown[], settings: Record<string, unknown> = {}) {
  const site = await (await request.post("/api/sites", { data: { name: `Style ${Date.now()}${Math.random()}` } })).json();
  if (Object.keys(settings).length > 0) expect((await request.patch(`/api/sites/${site.id}`, { data: settings })).ok()).toBe(true);
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  const res = await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  expect(res.ok()).toBe(true);
  return { site, pageId: pages[0].id as string };
}

const heading = (id: string, text: string, level: number, color = "") => ({
  id,
  type: "heading",
  props: { text, level, align: "left", color, weight: "bold" },
});
const paragraph = (id: string, text: string) => ({ id, type: "text", props: { text, align: "left", size: "base", color: "" } });

const css = (el: Locator, prop: "color" | "fontSize" | "backgroundImage") => el.evaluate((node, p) => getComputedStyle(node)[p], prop);
const saved = (page: Page) => expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });

async function openSettings(page: Page, siteId: string, tab: "General" | "Theme") {
  await page.goto(`/admin/sites/${siteId}`);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: tab, exact: true }).click();
}

test.describe("The site palette", () => {
  test("is offered in a block's colour field, and the block follows it when it changes", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, [heading("h", "Brand words", 2)], { palette: ["#0f766e"] });
    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await page.waitForSelector(".public-canvas");
    await page.locator(".public-canvas .editor-block").filter({ hasText: "Brand words" }).first().click();
    // The first: the block's own colour field. The frame's fill below offers the palette too.
    const swatch = page.locator("aside").last().getByRole("button", { name: "Site colour 1" }).first();
    await swatch.click();

    const onCanvas = page.locator(".public-canvas h2").filter({ hasText: "Brand words" });
    await expect.poll(() => css(onCanvas, "color")).toBe("rgb(15, 118, 110)");
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
    await saved(page);

    await page.goto(`/sites/${site.slug}`);
    expect(await css(page.getByRole("heading", { name: "Brand words" }), "color")).toBe("rgb(15, 118, 110)");

    // The palette changes; the block was never opened again.
    await request.patch(`/api/sites/${site.id}`, { data: { palette: ["#be123c"] } });
    await page.goto(`/sites/${site.slug}`);
    expect(await css(page.getByRole("heading", { name: "Brand words" }), "color")).toBe("rgb(190, 18, 60)");

    // And the download carries the palette with the page, not a copy of the hex.
    const html = readFromZip(Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body()), "index.html") ?? "";
    expect(html).toContain("--site-color-1: #be123c");
    expect(html).toContain("color:var(--site-color-1, #0f766e)");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is set in the site's settings, and a slot emptied keeps the others where they were", async ({ page, request }) => {
    const { site } = await siteWith(request, [], { palette: ["#0f766e", "#f59e0b"] });
    await openSettings(page, site.id, "General");

    await page.getByRole("button", { name: "Take away site colour 1" }).click();
    await page.getByRole("button", { name: "Add colour 3" }).click();
    await page.getByLabel("Site colour 3, as hex").fill("#123456");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    const stored = await (await request.get(`/api/sites/${site.id}`)).json();
    expect(JSON.parse(stored.palette)).toEqual(["", "#f59e0b", "#123456"]);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The site's text sizes", () => {
  test("are set once and every heading and paragraph follows them", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, [heading("a", "Top heading", 1), heading("b", "Second heading", 2), paragraph("t", "Plain words")]);
    await openSettings(page, site.id, "Theme");
    await page.getByLabel("Heading 1", { exact: true }).fill("40");
    await page.getByLabel("Body text", { exact: true }).fill("20");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.goto(`/sites/${site.slug}`);
    expect(await css(page.getByRole("heading", { name: "Top heading" }), "fontSize")).toBe("40px");
    // Not set, so drawn as it always was.
    expect(await css(page.getByRole("heading", { name: "Second heading" }), "fontSize")).toBe("48px");
    expect(await css(page.getByText("Plain words"), "fontSize")).toBe("20px");

    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await page.waitForSelector(".public-canvas");
    expect(await css(page.locator(".public-canvas h1").filter({ hasText: "Top heading" }), "fontSize")).toBe("40px");
    expect(await css(page.locator(".public-canvas p").filter({ hasText: "Plain words" }), "fontSize")).toBe("20px");

    // A narrow window draws the heading at four fifths of its size.
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto(`/sites/${site.slug}`);
    expect(await css(page.getByRole("heading", { name: "Top heading" }), "fontSize")).toBe("32px");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A gradient fill", () => {
  test("is chosen in a section's panel and reaches the published page and the download", async ({ page, request }) => {
    const section = {
      id: "s",
      type: "section",
      props: { background: "#0f172a", paddingY: 48, paddingX: 24, maxWidth: "site", align: "left" },
      children: [paragraph("t", "Inside the band")],
    };
    const { site, pageId } = await siteWith(request, [section]);
    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await page.getByRole("button", { name: "outline", exact: true }).click();
    await page.getByRole("treeitem", { name: /Section/ }).click();
    const inspector = page.locator("aside").last();

    await inspector.getByRole("button", { name: "Gradient", exact: true }).click();
    const band = page.locator('.public-canvas div[style*="linear-gradient"]');
    // It starts from the colour the section already had and runs to the
    // site's accent, top to bottom (which the browser writes without an angle).
    await expect.poll(() => css(band, "backgroundImage")).toBe("linear-gradient(rgb(15, 23, 42), rgb(99, 102, 241))");
    await inspector.getByRole("combobox").filter({ has: page.locator('option[value="90"]') }).selectOption("90");
    await expect.poll(() => css(band, "backgroundImage")).toBe("linear-gradient(90deg, rgb(15, 23, 42), rgb(99, 102, 241))");
    await saved(page);

    await page.goto(`/sites/${site.slug}`);
    expect(await css(page.locator('div[style*="linear-gradient"]').first(), "backgroundImage")).toBe(
      "linear-gradient(90deg, rgb(15, 23, 42), rgb(99, 102, 241))",
    );

    const html = readFromZip(Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body()), "index.html") ?? "";
    expect(html).toContain("linear-gradient(90deg, #0f172a, #6366f1)");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
