import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFromZip } from "./zip";

/**
 * A site leaving the builder: to the address it will be hosted at, described
 * to search engines in their own terms, and as a backup that comes back whole.
 */

const heading = (id: string, words: string) => ({ id, type: "heading", props: { text: words, level: 1, align: "left", color: "", weight: "bold" } });
const faq = (id: string) => ({
  id,
  type: "accordion",
  props: {
    items: [
      { title: "Do you bake on Sundays?", body: "Yes, from <b>eight</b>." },
      { title: "Opening hours", body: "Not a question, so not given." },
    ],
    exclusive: false,
    openFirst: false,
    style: "bordered",
  },
});

/** A 16×16 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR42mNkYPhfz0AEYBxVSF+FjKSEIiMjI2VOxq8QvxHjVIjfiHEqxG/EOBXiN2KcCvEbMU4FAAzBEwFvQgXOAAAAAElFTkSuQmCC",
  "base64",
);

async function newSite(request: APIRequestContext) {
  const site = await (await request.post("/api/sites", { data: { name: `Publishing ${Date.now()}${Math.random()}` } })).json();
  const home = (await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json())[0];
  return { site, homeId: home.id as string };
}

async function addPage(request: APIRequestContext, siteId: string, title: string, content: unknown[]) {
  const page = await (await request.post(`/api/sites/${siteId}/pages`, { data: { title, slug: title.toLowerCase() } })).json();
  await request.put(`/api/pages/${page.id}/save`, { data: { published: true, content } });
  return page as { id: string; slug: string };
}

const structured = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test.describe("The site's address", () => {
  test("is set in the settings, and the download gives search engines full addresses and a sitemap", async ({ page, request }) => {
    const { site, homeId } = await newSite(request);
    const upload = await (await request.post("/api/upload", { multipart: { file: { name: "og.png", mimeType: "image/png", buffer: PNG } } })).json();
    await request.put(`/api/pages/${homeId}/save`, { data: { published: true, content: [heading("h", "Welcome")] } });
    await addPage(request, site.id, "Menu", [heading("h", "Our bread")]);
    await request.patch(`/api/sites/${site.id}`, { data: { ogImage: upload.url } });

    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "SEO", exact: true }).click();
    await page.getByLabel("Where the site will live").fill("nonsense");
    await expect(page.getByRole("alert").filter({ hasText: "That is not a web address" })).toBeVisible();
    await page.getByLabel("Where the site will live").fill("www.bakery.example/");
    await page.getByLabel("Where the site will live").blur();
    await expect(page.getByLabel("Where the site will live")).toHaveValue("https://www.bakery.example");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await (await request.get(`/api/sites/${site.id}`)).json()).siteUrl).toBe("https://www.bakery.example");

    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const index = readFromZip(archive, "index.html")!;
    expect(index).toContain('<link rel="canonical" href="https://www.bakery.example/"');
    expect(index).toMatch(/<meta property="og:image" content="https:\/\/www\.bakery\.example\/uploads\/[^"]+\.png"/);
    expect(readFromZip(archive, "menu.html")).toContain('<link rel="canonical" href="https://www.bakery.example/menu.html"');
    const sitemap = readFromZip(archive, "sitemap.xml")!;
    expect(sitemap).toContain("<loc>https://www.bakery.example/</loc>");
    expect(sitemap).toContain("<loc>https://www.bakery.example/menu.html</loc>");
    expect(readFromZip(archive, "robots.txt")).toContain("Sitemap: https://www.bakery.example/sitemap.xml");
    // The page's own links stay relative, so the folder still opens from disk.
    expect(index).toMatch(/href="menu.html"/);

    await request.delete("/api/media", { data: { url: upload.url } });
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is asked for by the check before publishing while it is missing", async ({ request }) => {
    const { site, homeId } = await newSite(request);
    await request.put(`/api/pages/${homeId}/save`, { data: { published: true, content: [heading("h", "Welcome")] } });
    const check = async () => (await (await request.get(`/api/sites/${site.id}/check`)).json()).findings.map((f: { kind: string }) => f.kind);
    expect(await check()).toContain("address");
    await request.patch(`/api/sites/${site.id}`, { data: { siteUrl: "https://bakery.example" } });
    expect(await check()).not.toContain("address");
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Structured data", () => {
  test("describes the business on the home page and the questions on any page, in the builder and the download", async ({ request }) => {
    const { site, homeId } = await newSite(request);
    await request.put(`/api/pages/${homeId}/save`, { data: { published: true, content: [heading("h", "Welcome")] } });
    const questions = await addPage(request, site.id, "Questions", [heading("h", "Questions"), faq("f")]);
    await request.put(`/api/sites/${site.id}/legal`, {
      data: {
        legalForm: "gmbh",
        companyName: "Brot & Butter GmbH",
        address: { street: "Hauptstraße 1", extra: "", postalCode: "10115", city: "Berlin", country: "Deutschland" },
        phone: "+49 30 123456",
        email: "hallo@brot.example",
      },
    });

    // Nothing is said about the business until its kind has been chosen.
    expect(structured(await (await request.get(`/sites/${site.slug}`)).text())).toEqual([]);
    await request.patch(`/api/sites/${site.id}`, { data: { businessType: "Bakery", siteUrl: "https://bakery.example" } });

    const [business] = structured(await (await request.get(`/sites/${site.slug}`)).text());
    expect(business).toMatchObject({
      "@type": "Bakery",
      name: "Brot & Butter GmbH",
      address: { streetAddress: "Hauptstraße 1", postalCode: "10115", addressLocality: "Berlin" },
      telephone: "+49 30 123456",
    });
    expect(business.url).toMatch(new RegExp(`/sites/${site.slug}$`));

    const [questionsData] = structured(await (await request.get(`/sites/${site.slug}/${questions.slug}`)).text());
    expect(questionsData).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Do you bake on Sundays?", acceptedAnswer: { "@type": "Answer", text: "Yes, from eight." } }],
    });

    // In the download the data survives the scripts being taken out, and
    // names the site where it will be hosted.
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const index = readFromZip(archive, "index.html")!;
    expect(index.match(/<script\b/g)).toHaveLength(1);
    expect(structured(index)[0].url).toBe("https://bakery.example/");
    expect(structured(readFromZip(archive, "questions.html")!)[0]["@type"]).toBe("FAQPage");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A backup", () => {
  test("carries the site's pictures, and is imported from the list of sites with them", async ({ page, request }) => {
    const { site, homeId } = await newSite(request);
    const upload = await (await request.post("/api/upload", { multipart: { file: { name: "shop.png", mimeType: "image/png", buffer: PNG } } })).json();
    await request.patch("/api/media", { data: { url: upload.url, name: "Shop front", alt: "The shop from the street" } });
    await request.put(`/api/pages/${homeId}/save`, {
      data: {
        published: true,
        content: [heading("h", "Welcome"), { id: "i", type: "image", props: { src: upload.url, alt: "The shop", rounded: "none", width: "large", caption: "" } }],
      },
    });

    const backup = Buffer.from(await (await request.get(`/api/sites/${site.id}/backup`)).body());
    expect(readFromZip(backup, "site.json")).toContain(upload.url);
    expect(JSON.parse(readFromZip(backup, "media.json")!)).toEqual([
      { path: `uploads/${upload.url.slice("/uploads/".length)}`, name: "Shop front", alt: "The shop from the street", variantOf: null },
    ]);
    expect(readFromZip(backup, upload.url.slice(1))).not.toBeNull();

    // The site and its picture are gone, as after a new computer or a lost disk.
    await request.delete(`/api/sites/${site.id}?permanent=1`);
    await request.delete("/api/media", { data: { url: upload.url } });
    expect((await request.get(upload.url)).status()).toBe(404);

    await page.goto("/");
    await page.getByLabel("Site backup or export").setInputFiles({ name: "backup.zip", mimeType: "application/zip", buffer: backup });
    await page.waitForURL(/\/admin\/sites\/[^/?]+$/, { timeout: 30000 });
    const restoredId = page.url().split("/").pop()!;

    const pages = await (await request.get(`/api/sites/${restoredId}/pages?all=1`)).json();
    const image = JSON.parse(pages[0].content).find((b: { type: string }) => b.type === "image");
    expect(image.props.src).toMatch(/^\/uploads\//);
    expect(image.props.src).not.toBe(upload.url);
    expect((await request.get(image.props.src)).status()).toBe(200);
    const library = (await (await request.get("/api/media")).json()) as { url: string; name: string; alt: string }[];
    expect(library.find((f) => f.url === image.props.src)).toMatchObject({ name: "Shop front", alt: "The shop from the street" });

    await request.delete("/api/media", { data: { url: image.props.src } });
    await request.delete(`/api/sites/${restoredId}?permanent=1`);
  });

  test("is told apart from a download of the site, which cannot be imported", async ({ page, request }) => {
    const { site, homeId } = await newSite(request);
    await request.put(`/api/pages/${homeId}/save`, { data: { published: true, content: [heading("h", "Welcome")] } });
    const download = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    await page.goto("/");
    await page.getByLabel("Site backup or export").setInputFiles({ name: "site.zip", mimeType: "application/zip", buffer: download });
    await expect(page.getByRole("alert").filter({ hasText: "not a Neuravex backup" })).toBeVisible();
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
