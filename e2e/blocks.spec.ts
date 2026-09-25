import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFromZip } from "./zip";

/**
 * The ten blocks that work without a script.
 *
 * A gallery that opens a picture, a slider that moves, an accordion that
 * closes the others — every one of them does it with anchors, `:target` and
 * `<details>`, because the downloaded site carries no JavaScript at all. The
 * unit tests cover what each block stores; these cover what a visitor gets,
 * on the page the builder serves and on the one opened from disk.
 */

const STOCK = "/stock/nature/sam-ferrara-1527pjeb6jg-unsplash.jpg";
const STOCK_2 = "/stock/nature/cristian-palmer-3leBubkp5hk-unsplash.jpg";

const picture = (src: string, alt: string) => ({ src, alt, caption: "", naturalWidth: 2560, naturalHeight: 1706 });

function everyBlock() {
  return [
    { id: "gal", type: "gallery", props: { images: [picture(STOCK, "Peaks"), picture(STOCK_2, "Water")], columns: 2, lightbox: true } },
    {
      id: "faq",
      type: "accordion",
      props: {
        exclusive: true,
        items: [
          { title: "First question", body: "First answer" },
          { title: "Second question", body: "Second answer" },
        ],
      },
    },
    { id: "sld", type: "slider", props: { slides: [picture(STOCK, "Peaks"), picture(STOCK_2, "Water")] } },
    { id: "ico", type: "icon", props: { icon: "phone", title: "Call us", text: "Weekdays nine to five" } },
    {
      id: "soc",
      type: "social",
      props: { links: [{ network: "instagram", href: "https://www.instagram.com/acme" }, { network: "email", href: "mailto:hi@acme.test" }] },
    },
    { id: "tbl", type: "table", props: { rows: [["Day", "Hours"], ["Monday", "9–5"]], headerRow: true, caption: "Opening hours" } },
    {
      id: "prc",
      type: "pricing",
      props: { plans: [{ name: "Pro", price: "€29", period: "per month", features: ["Ten projects"], buttonLabel: "Choose Pro", buttonHref: "#" }] },
    },
    { id: "map", type: "map", props: { address: "Pariser Platz, Berlin", lat: 52.5163, lng: 13.3777, zoom: 16, mode: "card" } },
    { id: "cod", type: "code", props: { code: '<script>window.__ran = true</script>\nconst answer = 42;', language: "javascript" } },
    { id: "vid", type: "video", props: { src: "https://youtu.be/dQw4w9WgXcQ" } },
  ];
}

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (await request.post("/api/sites", { data: { name: `Blocks ${Date.now()}${Math.random()}` } })).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  const res = await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  expect(res.ok()).toBe(true);
  return { site, page: pages[0] };
}

/** Everything the page reached for that the browser refused or could not find. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/.test(m.text())) problems.push(m.text());
  });
  return problems;
}

test.describe("The new blocks on a published page", () => {
  test("all draw, with the markup that works without a script", async ({ page, request }) => {
    const { site } = await siteWith(request, everyBlock());
    const problems = watch(page);
    await page.goto(`/sites/${site.slug}`);

    await expect(page.locator(".nvx-gallery-item")).toHaveCount(2);
    await expect(page.locator("details.nvx-accordion-item")).toHaveCount(2);
    await expect(page.locator('[aria-roledescription="slide"]')).toHaveCount(2);
    await expect(page.locator(".nvx-icon svg")).toHaveCount(1);
    await expect(page.getByRole("list", { name: "Social links" }).getByRole("link")).toHaveCount(2);
    await expect(page.locator("table caption")).toHaveText("Opening hours");
    await expect(page.locator("table thead th")).toHaveCount(2);
    await expect(page.locator(".nvx-pricing-button")).toHaveText(/Choose Pro/);
    await expect(page.locator(".nvx-map").getByRole("link", { name: /OpenStreetMap/ })).toBeVisible();
    await expect(page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveCount(1);

    // A code sample is text, however much it looks like markup.
    await expect(page.locator(".nvx-code__code")).toContainText("<script>window.__ran = true</script>");
    expect(await page.evaluate(() => (window as unknown as { __ran?: boolean }).__ran)).toBeUndefined();

    expect(problems).toEqual([]);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("a gallery picture opens, steps and closes by its links alone", async ({ page, request }) => {
    const { site } = await siteWith(request, everyBlock());
    await page.goto(`/sites/${site.slug}`);

    const overlays = page.locator(".nvx-gallery-lightbox");
    await expect(overlays.first()).toBeHidden();
    await page.locator(".nvx-gallery-item a").first().click();
    await expect(overlays.nth(0)).toBeVisible();
    await overlays.nth(0).getByRole("link", { name: "Next picture" }).click();
    await expect(overlays.nth(1)).toBeVisible();
    await expect(overlays.nth(0)).toBeHidden();
    await overlays.nth(1).getByRole("link", { name: "Close" }).click();
    await expect(overlays.nth(1)).toBeHidden();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("an accordion set to close the others does", async ({ page, request }) => {
    const { site } = await siteWith(request, everyBlock());
    await page.goto(`/sites/${site.slug}`);

    const items = page.locator("details.nvx-accordion-item");
    await items.nth(0).locator("summary").click();
    await expect(items.nth(0)).toHaveAttribute("open", "");
    await items.nth(1).locator("summary").click();
    await expect(items.nth(1)).toHaveAttribute("open", "");
    await expect(items.nth(0)).not.toHaveAttribute("open", "");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("a slider moves to the next picture by a link", async ({ page, request }) => {
    const { site } = await siteWith(request, everyBlock());
    await page.goto(`/sites/${site.slug}`);

    // The dots, because with dots drawn the arrows are left out of the tab
    // order and the accessibility tree: two links a slide said nothing the
    // dots do not.
    const track = page.getByRole("region", { name: "Slideshow" });
    const before = await track.evaluate((el) => el.scrollLeft);
    await page.getByRole("link", { name: "Go to slide 2" }).click();
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("links a block keeps are checked on the way in", async ({ request }) => {
    const { site, page } = await siteWith(request, [
      { id: "s", type: "social", props: { links: [{ network: "website", href: "javascript:alert(1)" }] } },
      { id: "p", type: "pricing", props: { plans: [{ name: "X", buttonLabel: "Go", buttonHref: "javascript:alert(1)" }] } },
      { id: "g", type: "gallery", props: { images: [{ src: "javascript:alert(1)", alt: "" }] } },
    ]);
    const stored = JSON.stringify(await (await request.get(`/api/pages/${page.id}`)).json());
    expect(stored).not.toContain("javascript:");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The new blocks in the downloaded site", () => {
  test("carry no script, and bring their pictures with them", async ({ request }) => {
    const { site } = await siteWith(request, everyBlock());
    const res = await request.get(`/api/sites/${site.id}/download`);
    expect(res.ok()).toBe(true);
    const archive = Buffer.from(await res.body());

    const html = readFromZip(archive, "index.html") ?? "";
    // The whole design rests on this: every one of them works from markup.
    expect(html).not.toMatch(/<script\b/i);
    expect(html).toMatch(/class="[^"]*nvx-gallery-lightbox/);
    expect(html).toMatch(/href="#nvx-gal-photo-1"/);
    expect(html).toMatch(/class="nvx-slider-anchor"/);
    expect(html).toMatch(/href="#nvx-sld-slide-1"/);
    expect(html).toMatch(/<details[^>]*name="[^"]+"/);

    // What opens a picture is a rule in the stylesheet beside the page.
    const css = readFromZip(archive, "assets/site.css") ?? "";
    expect(css).toMatch(/\.nvx-gallery-lightbox:target/);

    // And the pictures are in the archive, where the page now looks for them.
    expect(readFromZip(archive, "stock/nature/sam-ferrara-1527pjeb6jg-unsplash.jpg")).not.toBeNull();
    expect(readFromZip(archive, "stock/nature/cristian-palmer-3leBubkp5hk-unsplash.jpg")).not.toBeNull();
    expect(html).toContain('src="stock/nature/sam-ferrara-1527pjeb6jg-unsplash.jpg"');

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The palette", () => {
  test("offers every new block, and each one lands on the page", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, []);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);
    await page.waitForSelector(".public-canvas");

    for (const label of ["Gallery", "Slider", "Audio", "Map", "Accordion", "Icon", "Social links", "Table", "Pricing", "Code"]) {
      const before = await page.locator(".public-canvas .editor-block").count();
      // A palette entry is named by its icon and then its label: "▦ Gallery".
      await page.getByRole("button", { name: new RegExp(`^\\S+ ${label}$`) }).click();
      await expect(page.locator(".public-canvas .editor-block")).toHaveCount(before + 1);
    }

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
