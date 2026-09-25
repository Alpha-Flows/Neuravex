import { readFileSync } from "fs";
import { join } from "path";
import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { readBytesFromZip, readFromZip } from "./zip";

/**
 * The site's fonts: picked from the ones Neuravex carries, or a file of the
 * author's own, and in either case drawn from a file the builder serves and
 * the download carries — never from the visitor's own computer, and never
 * from anybody else's server.
 */

const content = [
  { id: "h", type: "heading", props: { text: "Big words", level: 1, align: "left", color: "", weight: "bold" } },
  { id: "t", type: "text", props: { text: "Small words" } },
];

async function siteWith(request: APIRequestContext) {
  const site = await (await request.post("/api/sites", { data: { name: `Fonts ${Date.now()}${Math.random()}` } })).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  const res = await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  expect(res.ok()).toBe(true);
  return { site, pageId: pages[0].id as string };
}

async function openTheme(page: Page, siteId: string) {
  await page.goto(`/admin/sites/${siteId}`);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Theme" }).click();
}

async function pick(page: Page, field: "Body font" | "Heading font", family: string) {
  await page.getByRole("button", { name: new RegExp(`^${field}:`) }).click();
  await page.getByRole("group", { name: `${field} choices` }).getByRole("button", { name: family, exact: true }).click();
  await expect(page.getByRole("button", { name: `${field}: ${family}` })).toBeVisible();
}

/** The family an element is drawn in, and whether the browser really has that font. */
const drawnIn = (el: Locator) =>
  el.evaluate(async (node) => {
    await document.fonts.ready;
    const family = getComputedStyle(node).fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const faces: FontFace[] = [];
    document.fonts.forEach((face) => faces.push(face));
    const loaded = faces.some((face) => face.family.replace(/["']/g, "") === family && face.status === "loaded");
    return { family, loaded };
  });

test.describe("The site's fonts", () => {
  test("are picked by sight, and a visitor gets the files rather than a fallback", async ({ page, request, browser }) => {
    const { site, pageId } = await siteWith(request);
    await openTheme(page, site.id);
    await pick(page, "Body font", "Lora");
    await pick(page, "Heading font", "Oswald");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    // A browser of its own, as a visitor's is: the settings page has already
    // loaded every font to show it, and this one must fetch what it uses.
    const visitor = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const view = await visitor.newPage();
    const fetched: string[] = [];
    view.on("response", (res) => {
      if (res.url().includes("/fonts/") && res.ok()) fetched.push(new URL(res.url()).pathname);
    });
    await view.goto(`/sites/${site.slug}`);
    expect(await drawnIn(view.getByRole("heading", { name: "Big words" }))).toEqual({ family: "Oswald", loaded: true });
    expect(await drawnIn(view.getByText("Small words"))).toEqual({ family: "Lora", loaded: true });
    // The Latin file each, and not the Latin Extended one: nothing on the page needs it.
    expect(fetched).toContain("/fonts/oswald/latin-normal.woff2");
    expect(fetched).toContain("/fonts/lora/latin-normal.woff2");
    expect(fetched.filter((p) => p.includes("latin-ext"))).toEqual([]);
    await visitor.close();

    // The canvas draws it the same.
    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await page.waitForSelector(".public-canvas");
    expect(await drawnIn(page.locator(".public-canvas h1").filter({ hasText: "Big words" }))).toEqual({ family: "Oswald", loaded: true });

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("can be a file of the author's own, named from its file name", async ({ page, request }) => {
    const { site } = await siteWith(request);
    await openTheme(page, site.id);

    // Any real font file will do; this one is Space Grotesk under another name.
    const buffer = readFileSync(join(process.cwd(), "public", "fonts", "space-grotesk", "latin-normal.woff2"));
    await page.getByLabel("Font file").setInputFiles({ name: "HouseGrotesk-Bold.woff2", mimeType: "font/woff2", buffer });
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("House Grotesk");
    await expect(page.getByLabel("Weight")).toHaveValue("700");

    // A bundled font's name is not free to take.
    await page.getByLabel("Name", { exact: true }).fill("Inter");
    await page.getByRole("button", { name: "Add font" }).click();
    await expect(page.getByText("not one of the fonts Neuravex already has")).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("House Grotesk");
    await page.getByRole("button", { name: "Add font" }).click();
    await expect(page.getByRole("button", { name: "Take away House Grotesk Bold" })).toBeVisible();
    await pick(page, "Heading font", "House Grotesk");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    const saved = await (await request.get(`/api/sites/${site.id}`)).json();
    const fonts = JSON.parse(saved.fonts);
    expect(fonts).toEqual([
      { family: "House Grotesk", url: expect.stringMatching(/^\/uploads\/[a-z0-9]+\.woff2$/), weight: "700", style: "normal", category: "sans" },
    ]);

    await page.goto(`/sites/${site.slug}`);
    expect(await drawnIn(page.getByRole("heading", { name: "Big words" }))).toEqual({ family: "House Grotesk", loaded: true });

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("go into the download with their licences, and the pages point at them there", async ({ request }) => {
    const { site } = await siteWith(request);
    const upload = await request.post("/api/upload", {
      headers: { "Content-Type": "font/woff2", "X-File-Name": "brand.woff2" },
      data: readFileSync(join(process.cwd(), "public", "fonts", "inter", "latin-normal.woff2")),
    });
    expect(upload.ok()).toBe(true);
    const { url } = await upload.json();
    await request.patch(`/api/sites/${site.id}`, {
      data: {
        fontFamily: '"Merriweather", ui-serif, Georgia, serif',
        headingFont: '"Brand Sans", ui-sans-serif, sans-serif',
        fonts: [{ family: "Brand Sans", url, weight: "400", style: "normal", category: "sans" }],
      },
    });

    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const html = readFromZip(archive, "index.html") ?? "";
    expect(html).toContain('url("fonts/merriweather/latin-normal.woff2")');
    expect(html).toContain(`url("${url.slice(1)}")`);
    expect(html).not.toMatch(/url\("\/(fonts|uploads)\//);

    for (const file of ["latin-normal", "latin-ext-normal", "latin-italic", "latin-ext-italic"]) {
      expect(readBytesFromZip(archive, `fonts/merriweather/${file}.woff2`)?.subarray(0, 4).toString("latin1"), file).toBe("wOF2");
    }
    expect(readFromZip(archive, "fonts/merriweather/OFL.txt")).toMatch(/SIL OPEN FONT LICENSE/i);
    expect(readBytesFromZip(archive, url.slice(1))?.subarray(0, 4).toString("latin1")).toBe("wOF2");
    // Only the fonts the site uses.
    expect(readFromZip(archive, "fonts/inter/OFL.txt")).toBeNull();
    expect(readFromZip(archive, "README.txt")).toContain("fonts/");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
