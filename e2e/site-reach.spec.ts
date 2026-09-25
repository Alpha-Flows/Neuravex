import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { deflateSync } from "zlib";
import { readFromZip } from "./zip";

/**
 * A site reaching the people it is for: an address that keeps working after
 * a rename, the same page in another language, pictures the size of the
 * screen they are sent to and cropped around what matters, and a look over
 * the whole site before it goes out.
 */

const text = (id: string, words: string) => ({ id, type: "text", props: { text: words, align: "left", size: "base", color: "" } });
const heading = (id: string, words: string, level = 1) => ({ id, type: "heading", props: { text: words, level, align: "left", color: "", weight: "bold" } });
const button = (id: string, label: string, href: string) => ({
  id,
  type: "button",
  props: { label, href, variant: "primary", size: "md", align: "left", color: "", textColor: "" },
});

async function newSite(request: APIRequestContext, name = "Reach") {
  const site = await (await request.post("/api/sites", { data: { name: `${name} ${Date.now()}${Math.random()}` } })).json();
  const home = (await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json())[0];
  return { site, homeId: home.id as string };
}

async function addPage(request: APIRequestContext, siteId: string, title: string, content: unknown[], extra: Record<string, unknown> = {}) {
  const page = await (await request.post(`/api/sites/${siteId}/pages`, { data: { title, slug: title.toLowerCase().replace(/\s+/g, "-") } })).json();
  await request.put(`/api/pages/${page.id}/save`, { data: { published: true, content, ...extra } });
  return page as { id: string; slug: string };
}

const content = async (request: APIRequestContext, pageId: string) => JSON.parse((await (await request.get(`/api/pages/${pageId}`)).json()).content);
const saved = (page: Page) => expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });

/**
 * A PNG of `width` by `height`, drawn as a gradient, encoded here rather than
 * kept as a fixture: a picture wide enough to be made smaller is several
 * megabytes, and the repository is no place for it.
 */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const at = row + 1 + x * 3;
      raw[at] = (x * 255) / width;
      raw[at + 1] = (y * 255) / height;
      raw[at + 2] = ((x ^ y) & 0xff) / 2;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test.describe("A renamed page", () => {
  test("forwards its old address, takes the site's links with it, and leaves a forwarding page in the download", async ({ page, request }) => {
    const { site, homeId } = await newSite(request);
    const about = await addPage(request, site.id, "About", [heading("h", "About us")]);
    await request.put(`/api/pages/${homeId}/save`, {
      data: { published: true, content: [heading("h", "Home"), button("b", "Meet us", `/sites/${site.slug}/about`)] },
    });

    await page.goto(`/admin/sites/${site.id}/pages/${about.id}`);
    await page.getByLabel("Page URL").fill("about-us");
    await page.getByLabel("Page URL").blur();
    await saved(page);

    // Inside the site the link moved with the page, the way it does from the dashboard.
    expect(JSON.stringify(await content(request, homeId))).toContain(`/sites/${site.slug}/about-us`);
    // Outside it, the old address sends a visitor on.
    const old = await request.get(`/sites/${site.slug}/about`, { maxRedirects: 0 });
    expect(old.status()).toBe(307);
    expect(old.headers()["location"]).toBe(`/sites/${site.slug}/about-us`);
    await page.goto(`/sites/${site.slug}/about`);
    await expect(page).toHaveURL(new RegExp(`/sites/${site.slug}/about-us$`));

    // The download leaves a page under the old file name.
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const forward = readFromZip(archive, "about.html");
    expect(forward).toContain('<meta http-equiv="refresh" content="0; url=about-us.html">');
    expect(forward).toContain('<link rel="canonical" href="about-us.html">');
    expect(readFromZip(archive, "README.txt")).toContain("about.html");

    // The page's settings list the old address, and it can be let go.
    await page.goto(`/admin/sites/${site.id}/pages/${about.id}`);
    const former = page.locator("[data-former-addresses]");
    await expect(former).toContainText("/about");
    await former.getByRole("button", { name: "Stop forwarding /about" }).click();
    await expect(former).toHaveCount(0);
    expect((await request.get(`/sites/${site.slug}/about`, { maxRedirects: 0 })).status()).toBe(404);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("that was never published leaves nothing behind", async ({ request }) => {
    const { site } = await newSite(request);
    const draft = await (await request.post(`/api/sites/${site.id}/pages`, { data: { title: "Draft", slug: "draft" } })).json();
    await request.patch(`/api/pages/${draft.id}`, { data: { slug: "notes" } });
    expect((await (await request.get(`/api/pages/${draft.id}/redirects`)).json()).formerSlugs).toEqual([]);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A site in two languages", () => {
  test("links each page to its translation, in its own language, for readers and for search engines", async ({ page, request }) => {
    const { site, homeId } = await newSite(request);
    await request.put(`/api/pages/${homeId}/save`, { data: { published: true, content: [heading("h", "Welcome")] } });
    const about = await addPage(request, site.id, "About", [heading("h", "About us")]);

    // A German copy of each, made from the page and joined to it.
    const translate = async (pageId: string, title: string) => {
      const made = await (await request.post(`/api/pages/${pageId}/translations`, { data: { language: "de" } })).json();
      await request.put(`/api/pages/${made.createdId}/save`, { data: { title, published: true } });
      return (await (await request.get(`/api/pages/${made.createdId}`)).json()) as { id: string; slug: string };
    };
    const start = await translate(homeId, "Start");
    const ueber = await translate(about.id, "Über uns");
    expect(start.slug).toBe("de");
    expect(ueber.slug).toBe("about-de");

    await page.goto(`/sites/${site.slug}/about-de`);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    const switcher = page.locator('nav[data-nav="languages"]');
    await expect(switcher.getByRole("link", { name: "English" })).toHaveAttribute("href", `/sites/${site.slug}/about`);
    await expect(switcher.getByRole("link", { name: "Deutsch" })).toHaveAttribute("aria-current", "true");
    // The German menu is the German pages, under their own titles.
    const nav = page.locator('nav[data-nav="desktop"]');
    await expect(nav).toContainText("Start");
    await expect(nav).toContainText("Über uns");
    await expect(nav).not.toContainText("About");
    await expect(page.locator("header a").first()).toHaveAttribute("href", `/sites/${site.slug}/de`);

    await page.goto(`/sites/${site.slug}/about`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveAttribute("href", new RegExp(`/sites/${site.slug}/about-de$`));
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", new RegExp(`/sites/${site.slug}/about$`));
    await expect(page.locator('nav[data-nav="desktop"]')).not.toContainText("Über uns");

    // The editor lists the translation, and makes another.
    await page.goto(`/admin/sites/${site.id}/pages/${about.id}`);
    const panel = page.locator("[data-translations]");
    await expect(panel.getByRole("list", { name: "Translations" })).toContainText("Über uns");
    await panel.getByLabel("Translate into").selectOption("fr");
    await panel.getByRole("button", { name: "Make a copy" }).click();
    await expect(panel.getByRole("status")).toContainText("A French draft is ready to translate.");
    await expect(panel.getByRole("list", { name: "Translations" })).toContainText("French");

    // The download keeps both, each in its language, linked to the other.
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const german = readFromZip(archive, "about-de.html");
    expect(german).toContain('<html lang="de"');
    expect(german).toMatch(/<a[^>]*href="about.html"[^>]*hreflang="en"/i);
    expect(german).toMatch(/<link rel="alternate" hreflang="en" href="about.html"/i);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A picture uploaded", () => {
  test("is made lighter on the way in, and a page offers a phone the copy its size", async ({ page, request }) => {
    const { site, homeId } = await newSite(request);
    await request.put(`/api/pages/${homeId}/save`, { data: { published: true, content: [heading("h", "Gallery")] } });

    await page.goto(`/admin/sites/${site.id}/pages/${homeId}`);
    await page.locator("button", { hasText: "Image" }).first().click();
    await page.locator("text=Upload image").first().click();
    await expect(page.getByLabel("Make pictures lighter")).toBeChecked();
    await page.locator('[role="dialog"] input[type="file"]').first().setInputFiles({
      name: "Harbour at dusk.png",
      mimeType: "image/png",
      buffer: png(2800, 1400),
    });
    await expect(page.locator(".public-canvas figure img").first()).toHaveAttribute("src", /^\/uploads\/.+\.webp$/, { timeout: 30000 });
    await saved(page);

    const image = (await content(request, homeId)).find((b: { type: string }) => b.type === "image");
    expect(image.props.naturalWidth).toBe(2400);
    expect(image.props.naturalHeight).toBe(1200);

    // One picture in the library, not four.
    const library = (await (await request.get("/api/media")).json()) as { url: string; name: string }[];
    expect(library.filter((f) => f.name.startsWith("Harbour at dusk"))).toHaveLength(1);

    await page.goto(`/sites/${site.slug}`);
    const srcset = await page.locator("main figure img").first().getAttribute("srcset");
    expect(srcset).toMatch(/ 2400w, .+ 1600w, .+ 960w, .+ 480w$/);

    // The copies travel with the site.
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    for (const candidate of srcset!.split(", ")) {
      const file = candidate.split(" ")[0].replace(/^\//, "");
      expect(() => readFromZip(archive, file)).not.toThrow();
    }

    await request.delete("/api/media", { data: { url: image.props.src } });
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A cropped picture", () => {
  test("keeps the point chosen for it in view, behind a section and in an image block", async ({ page, request }) => {
    const upload = await (
      await request.post("/api/upload", { multipart: { file: { name: "portrait.png", mimeType: "image/png", buffer: png(200, 300) } } })
    ).json();
    const { site, homeId } = await newSite(request);
    await request.put(`/api/pages/${homeId}/save`, {
      data: {
        published: true,
        content: [
          { id: "s", type: "section", props: { background: "", backgroundImage: upload.url, paddingY: 96, paddingX: 24, maxWidth: "site", align: "left" }, children: [heading("h", "Hello")] },
          { id: "i", type: "image", props: { src: upload.url, alt: "A portrait", rounded: "none", width: "medium", caption: "", shape: "16/9", focus: "50% 20%" } },
        ],
      },
    });

    // Opened with the section chosen, as the check before publishing opens a page.
    await page.goto(`/admin/sites/${site.id}/pages/${homeId}?block=s`);
    const picker = page.locator("[data-focus-picker]");
    const picture = picker.locator("img");
    const box = (await picture.boundingBox())!;
    await picture.click({ position: { x: box.width * 0.25, y: box.height * 0.75 } });
    await expect
      .poll(async () => (await content(request, homeId))[0].props.backgroundFocus, { timeout: 10000 })
      .toMatch(/^2[4-6]% 7[4-6]%$/);
    await picker.getByRole("button").first().press("ArrowRight");
    await expect
      .poll(async () => (await content(request, homeId))[0].props.backgroundFocus, { timeout: 10000 })
      .toMatch(/^2[6-8]% 7[4-6]%$/);

    await page.goto(`/sites/${site.slug}`);
    const section = page.locator("main > div > div").first();
    await expect(section).toHaveCSS("background-position", /^2[6-8]% 7[4-6]%$/);
    const cropped = page.locator("main figure img").first();
    await expect(cropped).toHaveCSS("aspect-ratio", "16 / 9");
    await expect(cropped).toHaveCSS("object-position", "50% 20%");

    await request.delete("/api/media", { data: { url: upload.url } });
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The check before publishing", () => {
  test("lists what is worth fixing, and opens the block it is in", async ({ page, request }) => {
    const upload = await (
      await request.post("/api/upload", { multipart: { file: { name: "shop.png", mimeType: "image/png", buffer: png(40, 30) } } })
    ).json();
    const { site, homeId } = await newSite(request);
    await addPage(request, site.id, "Contact", [heading("h", "Write to us")], { published: false });
    await request.put(`/api/pages/${homeId}/save`, {
      data: {
        published: true,
        content: [
          heading("h", "Welcome"),
          { id: "i", type: "image", props: { src: upload.url, alt: "", rounded: "none", width: "large", caption: "" } },
          button("b", "Book now", "#"),
          button("c", "Write to us", `/sites/${site.slug}/contact`),
          heading("deep", "Opening hours", 4),
        ],
      },
    });

    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: "Check the site" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("problems a visitor will meet");
    const results = dialog.locator("[data-prepublish-results]");
    await expect(results).toContainText("A picture has no description");
    await expect(results).toContainText("The button “Book now” goes nowhere");
    await expect(results).toContainText("“Contact”, which is still a draft");
    await expect(results).toContainText("The heading “Opening hours” is level 4");

    await results.locator("li").filter({ hasText: "Book now" }).getByRole("link", { name: "Open" }).click();
    await page.waitForURL(/\/pages\/.+\?block=b$/);
    // The button is chosen, so its settings are what the panel shows.
    await expect
      .poll(() => page.locator("aside input").evaluateAll((els) => els.some((e) => (e as HTMLInputElement).value === "Book now")))
      .toBe(true);

    await request.delete("/api/media", { data: { url: upload.url } });
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
