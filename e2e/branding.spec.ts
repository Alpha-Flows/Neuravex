import { test, expect, APIRequestContext, Page } from "@playwright/test";

const BUTTON = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  id,
  type: "button",
  props: { label, href: "#", variant: "primary", size: "md", align: "left", color: "", textColor: "", ...over },
});

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Brand ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  return { site, page: pages[0] };
}

const bg = (page: Page, name: string) =>
  page.getByRole("link", { name }).locator("span").evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("The site accent", () => {
  test("recolours every button that has none of its own, and leaves the rest", async ({ page, request }) => {
    const { site } = await siteWith(request, [
      BUTTON("b1", "Follows the site"),
      BUTTON("b2", "Has its own", { color: "#ef4444" }),
    ]);

    await page.goto(`/sites/${site.slug}`);
    expect(await bg(page, "Follows the site")).toBe("rgb(99, 102, 241)");

    await request.patch(`/api/sites/${site.id}`, { data: { accent: "#059669" } });
    await page.goto(`/sites/${site.slug}`);
    expect(await bg(page, "Follows the site")).toBe("rgb(5, 150, 105)");
    expect(await bg(page, "Has its own")).toBe("rgb(239, 68, 68)");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("picks a readable label for a filled button, whoever chose the colour", async ({ page, request }) => {
    const { site } = await siteWith(request, [
      BUTTON("b1", "On the accent"),
      BUTTON("b2", "On its own pale colour", { color: "#fafafa" }),
    ]);
    await request.patch(`/api/sites/${site.id}`, { data: { accent: "#facc15" } });
    await page.goto(`/sites/${site.slug}`);

    const colour = (name: string) =>
      page.getByRole("link", { name }).locator("span").evaluate((el) => getComputedStyle(el).color);
    // Yellow and near-white are both bright: dark text on each, not white.
    expect(await colour("On the accent")).toBe("rgb(15, 23, 42)");
    expect(await colour("On its own pale colour")).toBe("rgb(15, 23, 42)");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("draws an outline button's label in the accent instead of white on white", async ({ page, request }) => {
    const { site } = await siteWith(request, [BUTTON("b1", "Outline", { variant: "outline" })]);
    await request.patch(`/api/sites/${site.id}`, { data: { accent: "#db2777" } });
    await page.goto(`/sites/${site.slug}`);

    const span = page.getByRole("link", { name: "Outline" }).locator("span");
    expect(await span.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(219, 39, 119)");
    expect(await span.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(219, 39, 119)");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("carries the site's corner radius", async ({ page, request }) => {
    const { site } = await siteWith(request, [BUTTON("b1", "Rounded")]);
    await request.patch(`/api/sites/${site.id}`, { data: { borderRadius: "1.5rem" } });
    await page.goto(`/sites/${site.slug}`);
    const span = page.getByRole("link", { name: "Rounded" }).locator("span");
    expect(await span.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("24px");
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A site made from a template", () => {
  test("starts on the template's own brand colour", async ({ request }) => {
    const templates = await (await request.get("/api/templates")).json();
    const restaurant = templates.find((t: { id: string }) => t.id === "restaurant");
    const site = await (
      await request.post("/api/sites", { data: { name: `Tpl ${Date.now()}`, templateId: restaurant.id } })
    ).json();
    expect(site.accent).toBe(restaurant.accent);
    expect(site.accent).not.toBe("#6366f1");
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The editor canvas", () => {
  test("shows the accent the published page will use, without repainting the builder", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [BUTTON("b1", "In the canvas")]);
    await request.patch(`/api/sites/${site.id}`, { data: { accent: "#059669" } });
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const button = page.locator(".public-canvas .inline-editable").first();
    await expect(button).toHaveText("In the canvas");
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(5, 150, 105)");

    // The builder's own chrome keeps its own colours.
    const palette = page.getByRole("button", { name: "Heading" }).first();
    expect(await palette.evaluate((el) => getComputedStyle(el).getPropertyValue("--site-accent"))).toBe("");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("hands a block's colour back to the site from the inspector", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [BUTTON("b1", "Pinned", { color: "#ef4444" })]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    await page.locator(".editor-block").first().click();
    await page.getByRole("button", { name: "Use site accent" }).click();
    await expect(page.getByRole("button", { name: "Using site accent" })).toBeVisible();

    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.content).not.toContain("#ef4444");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
