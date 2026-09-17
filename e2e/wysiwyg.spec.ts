import { test, expect, APIRequestContext, Page } from "@playwright/test";

async function siteWithChrome(request: APIRequestContext, settings: Record<string, unknown> = {}) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Wys ${Date.now()}${Math.random()}` } })
  ).json();
  await request.patch(`/api/sites/${site.id}`, {
    data: { footerHtml: null, customCss: "h1 { letter-spacing: -0.05em }", ...settings },
  });
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, {
    data: {
      title: "Home",
      published: true,
      content: [{ id: "h", type: "heading", props: { text: "In the canvas", level: 1, align: "left", color: "", weight: "bold" } }],
    },
  });
  const about = await (
    await request.post(`/api/sites/${site.id}/pages`, { data: { title: "About", slug: "about" } })
  ).json();
  await request.put(`/api/pages/${about.id}/save`, { data: { published: true, content: [] } });
  return { site, page: pages[0] };
}

const spacing = (page: Page) =>
  page.locator(".public-canvas h1").first().evaluate((el) => getComputedStyle(el).letterSpacing);

test.describe("The editor canvas", () => {
  test("shows the site header, its nav and the footer", async ({ page, request }) => {
    const { site, page: p } = await siteWithChrome(request);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const canvas = page.locator(".public-canvas");
    await expect(canvas.locator("header")).toBeVisible();
    await expect(canvas.locator("header").getByRole("link", { name: "About" })).toBeVisible();
    await expect(canvas.locator("footer")).toContainText("Built with Neuravex");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("applies the site's custom CSS, without letting it out of the canvas", async ({ page, request }) => {
    const { site, page: p } = await siteWithChrome(request, {
      customCss: "h1 { letter-spacing: -0.05em } body { background: rgb(1, 2, 3) }",
    });
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const canvasSpacing = await spacing(page);
    expect(canvasSpacing).not.toBe("normal");
    // `body { ... }` means the canvas here, and must not repaint the builder.
    const canvasBg = await page.locator(".public-canvas").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(canvasBg).toBe("rgb(1, 2, 3)");
    const appBg = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(appBg).not.toBe("rgb(1, 2, 3)");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("keeps a fixed header inside the canvas instead of over the builder", async ({ page, request }) => {
    const { site, page: p } = await siteWithChrome(request, { headerPosition: "fixed" });
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const editorBar = await page.locator("header").first().boundingBox();
    const siteHeader = await page.locator(".public-canvas header").boundingBox();
    expect(siteHeader).not.toBeNull();
    // The builder's own toolbar is above it and still uncovered.
    expect(siteHeader!.y).toBeGreaterThan(editorBar!.y + editorBar!.height - 1);
    // And it does not span the whole window.
    expect(siteHeader!.width).toBeLessThan(await page.evaluate(() => window.innerWidth));

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("keeps the editor's own controls out of the layout", async ({ page, request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Flow ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const content = [
      { id: "b1", type: "button", props: { label: "Press", href: "#", variant: "primary", size: "md", align: "left", color: "", textColor: "" } },
      { id: "h1", type: "heading", props: { text: "Right below", level: 2, align: "left", color: "", weight: "bold" } },
    ];
    await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });

    // The same two elements in both places: the button's label and the
    // heading under it.
    const gap = async () => {
      const label = await page.getByText("Press", { exact: true }).boundingBox();
      const heading = await page.locator(".public-canvas h2").boundingBox();
      return Math.round(heading!.y - (label!.y + label!.height));
    };

    await page.goto(`/sites/${site.slug}`);
    const publishedGap = await gap();

    await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);
    await page.waitForTimeout(500);
    const editorGap = await gap();

    // The "set link" control used to take a line of its own, pushing everything
    // under it down — a layout the published page never had.
    expect(editorGap).toBe(publishedGap);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The published page", () => {
  test("still renders with a fixed header and custom CSS", async ({ page, request }) => {
    const { site } = await siteWithChrome(request, { headerPosition: "fixed", headerShape: "pill" });
    await page.goto(`/sites/${site.slug}`);

    await expect(page.locator("h1")).toHaveText("In the canvas");
    await expect(page.locator("header")).toBeVisible();
    const published = await spacing(page);
    expect(published).not.toBe("normal");
    // A page that threw would render Next's error overlay instead.
    await expect(page.locator("text=Unhandled Runtime Error")).toHaveCount(0);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
