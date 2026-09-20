import { test, expect, APIRequestContext } from "@playwright/test";

const STOCK = "/stock/nature/pietro-de-grandi-Q5dMq3cKqec-unsplash.jpg";

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Img ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  return { site, page: pages[0] };
}

test.describe("A picture on a published page", () => {
  test("reserves its space before it loads, so nothing jumps", async ({ page, request }) => {
    const { site } = await siteWith(request, [
      { id: "i", type: "image", props: { src: STOCK, alt: "A lake below mountains", rounded: "xl", width: "large", caption: "", naturalWidth: 2560, naturalHeight: 3840 } },
      { id: "h", type: "heading", props: { text: "Under the picture", level: 2, align: "left", color: "", weight: "bold" } },
    ]);

    // Hold the image back, then read where the heading sits before it arrives.
    await page.route("**/*.jpg", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto(`/sites/${site.slug}`, { waitUntil: "domcontentloaded" });

    const before = (await page.getByRole("heading", { name: "Under the picture" }).boundingBox())!.y;
    await page.unroute("**/*.jpg");
    await page.waitForLoadState("networkidle");
    const after = (await page.getByRole("heading", { name: "Under the picture" }).boundingBox())!.y;

    // The space was already held: the heading does not move when the picture lands.
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("carries the size and the alt text it was given", async ({ page, request }) => {
    const { site } = await siteWith(request, [
      { id: "i", type: "image", props: { src: STOCK, alt: "A lake below mountains", rounded: "xl", width: "large", caption: "", naturalWidth: 2560, naturalHeight: 3840 } },
    ]);
    await page.goto(`/sites/${site.slug}`);
    const img = page.locator("figure img");
    await expect(img).toHaveAttribute("width", "2560");
    await expect(img).toHaveAttribute("height", "3840");
    await expect(img).toHaveAttribute("alt", "A lake below mountains");
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("still renders when nobody knows its size", async ({ page, request }) => {
    const { site } = await siteWith(request, [
      { id: "i", type: "image", props: { src: STOCK, alt: "", rounded: "xl", width: "large", caption: "" } },
    ]);
    await page.goto(`/sites/${site.slug}`);
    const img = page.locator("figure img");
    await expect(img).toBeVisible();
    expect(await img.getAttribute("width")).toBeNull();
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A site made from a template", () => {
  test("has alt text and a size on every picture", async ({ page, request }) => {
    const templates = await (await request.get("/api/templates")).json();
    const restaurant = templates.find((t: { id: string }) => t.id === "restaurant");
    const site = await (
      await request.post("/api/sites", { data: { name: `Tpl img ${Date.now()}`, templateId: restaurant.id } })
    ).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    for (const p of pages) await request.put(`/api/pages/${p.id}/save`, { data: { published: true } });

    await page.goto(`/sites/${site.slug}`);
    const images = page.locator("figure img");
    const count = await images.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      expect((await img.getAttribute("alt"))?.trim(), `image ${i} alt`).toBeTruthy();
      expect(await img.getAttribute("width"), `image ${i} width`).toBeTruthy();
    }

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Uploading a picture", () => {
  test("reports how big it is", async ({ request }) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAFCAYAAABirU3bAAAAFUlEQVR42mNk+M9QzzCKRsEoGgVDDwAA3ycH+VSgB2sAAAAASUVORK5CYII=",
      "base64",
    );
    const res = await request.post("/api/upload", {
      multipart: { file: { name: "probe.png", mimeType: "image/png", buffer: png } },
    });
    const info = await res.json();
    expect(info.url).toContain("/uploads/");
    expect(info.width).toBe(10);
    expect(info.height).toBe(5);
  });
});

test.describe("Choosing a picture from the library", () => {
  test("brings the description the library has for it", async ({ page, request }) => {
    // The library knew what every photograph showed and kept it to itself:
    // the picker handed back a URL and a size, so the picture landed on the
    // page with nothing for a screen reader to read.
    const site = await (
      await request.post("/api/sites", { data: { name: `Alt ${Date.now()}`, templateId: "blank" } })
    ).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);

    await page.locator("button", { hasText: "Image" }).first().click();
    const altField = page.locator('xpath=//label[normalize-space()="Alt text"]/following-sibling::input[1]');
    await expect(altField).toBeVisible();

    await page.locator("text=Upload image").first().click();
    await page.getByRole("button", { name: "Stock photos" }).click();
    const photo = page.locator("div.grid img").first();
    const described = await photo.getAttribute("alt");
    expect(described?.trim()).toBeTruthy();
    await photo.click();

    await expect(altField).toHaveValue(described!);

    // Words written by hand are not overwritten by the next picture.
    await altField.fill("My own words about this picture");
    await page.locator("text=Upload image").first().click();
    await page.getByRole("button", { name: "Stock photos" }).click();
    await page.locator("div.grid img").nth(1).click();
    await expect(altField).toHaveValue("My own words about this picture");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
