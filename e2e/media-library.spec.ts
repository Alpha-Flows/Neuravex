import { test, expect, APIRequestContext, Page } from "@playwright/test";

/** A 16×16 PNG, small enough to upload a few of them per test. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR42mNkYPhfz0AEYBxVSF+FjKSEIiMjI2VOxq8QvxHjVIjfiHEqxG/EOBXiN2KcCvEbMU4FAAzBEwFvQgXOAAAAAElFTkSuQmCC",
  "base64",
);

async function upload(request: APIRequestContext, filename: string) {
  const res = await request.post("/api/upload", {
    multipart: { file: { name: filename, mimeType: "image/png", buffer: PNG } },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function openPicker(page: Page, request: APIRequestContext) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Media ${Date.now()}${Math.random()}`, templateId: "blank" } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);
  await page.locator("button", { hasText: "Image" }).first().click();
  await page.locator("text=Upload image").first().click();
  await expect(page.getByLabel("Search pictures")).toBeVisible();
  return site;
}

test.describe("An uploaded picture", () => {
  test("keeps the name it arrived with", async ({ request }) => {
    // Uploads are stored under a generated name so two cannot collide, and
    // the library listed exactly that: "mu59seflqpe0.png", for every picture.
    const info = await upload(request, "Café Sunset Hero.png");
    expect(info.url).toMatch(/^\/uploads\//);
    expect(info.name).toBe("Café Sunset Hero.png");

    const library = await (await request.get("/api/media")).json();
    const entry = library.find((f: { url: string }) => f.url === info.url);
    expect(entry.name).toBe("Café Sunset Hero.png");
  });

  test("can be renamed and described, without changing its address", async ({ request }) => {
    const info = await upload(request, "raw-export-final-2.png");
    const res = await request.patch("/api/media", {
      data: { url: info.url, name: "Harbour at dusk", alt: "Boats moored in a harbour as the sun goes down" },
    });
    expect(res.ok()).toBeTruthy();
    const saved = await res.json();
    // The file stays where it is, so a page pointing at it cannot break.
    expect(saved.url).toBe(info.url);
    expect(saved.name).toBe("Harbour at dusk");

    const library = await (await request.get("/api/media")).json();
    const entry = library.find((f: { url: string }) => f.url === info.url);
    expect(entry.name).toBe("Harbour at dusk");
    expect(entry.alt).toBe("Boats moored in a harbour as the sun goes down");

    await request.delete("/api/media", { data: { url: info.url } });
  });

  test("is not left nameless, and not renamed through a path", async ({ request }) => {
    const info = await upload(request, "keep-me.png");
    expect((await request.patch("/api/media", { data: { url: info.url, name: "   " } })).status()).toBe(400);
    expect((await request.patch("/api/media", { data: { url: "/uploads/../../etc/passwd", name: "x" } })).status()).toBe(400);
    expect((await request.patch("/api/media", { data: { url: "/uploads/not-here.png", name: "x" } })).status()).toBe(404);
    await request.delete("/api/media", { data: { url: info.url } });
  });

  test("takes what is known about it with it when it is deleted", async ({ request }) => {
    const info = await upload(request, "temporary.png");
    await request.patch("/api/media", { data: { url: info.url, name: "Temporary", alt: "A placeholder" } });
    await request.delete("/api/media", { data: { url: info.url } });

    const library = await (await request.get("/api/media")).json();
    expect(library.find((f: { url: string }) => f.url === info.url)).toBeUndefined();
  });
});

test.describe("The picture library", () => {
  test("finds a picture by its name or by what it shows", async ({ page, request }) => {
    const hay = await upload(request, `Needle ${Date.now()}.png`);
    await request.patch("/api/media", {
      data: { url: hay.url, name: "Lighthouse at Skagen", alt: "A striped lighthouse above a grey sea" },
    });
    await openPicker(page, request);

    const cards = page.locator(".grid > div");
    const search = page.getByLabel("Search pictures");

    await search.fill("lighthouse");
    await expect(cards).toHaveCount(1);
    await expect(page.locator(".grid").getByText("Lighthouse at Skagen")).toBeVisible();

    // Two words, in the other order, matched against the description.
    await search.fill("sea striped");
    await expect(cards).toHaveCount(1);

    // Accents are folded on both sides: a plain keyboard finds "Skagen".
    await search.fill("skagén");
    await expect(cards).toHaveCount(1);

    await search.fill("nothing-by-this-name");
    await expect(cards).toHaveCount(0);
    await expect(page.getByText(/Nothing here matches/)).toBeVisible();

    await request.delete("/api/media", { data: { url: hay.url } });
  });

  test("hands a picture's description to the page, and takes an edit from here", async ({ page, request }) => {
    const file = await upload(request, `Quay ${Date.now()}.png`);
    await request.patch("/api/media", {
      data: { url: file.url, name: "Quay at dawn", alt: "Fishing boats at the quay at sunrise" },
    });
    await openPicker(page, request);
    await page.getByLabel("Search pictures").fill("quay at dawn");

    // Renaming and describing happen where the picture is, not in a file manager.
    await page.getByRole("button", { name: /^Edit Quay at dawn$/ }).click();
    await page.locator("#media-name").fill("Quay at first light");
    await page.locator("#media-alt").fill("Fishing boats at the quay as the sun comes up");
    await page.getByRole("figure").getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".grid").getByText("Quay at first light")).toBeVisible();

    // Choosing it carries the description onto the page, the way a bundled
    // photograph's does — an upload used to arrive with alt="".
    await page.locator(".grid > div img").first().click();
    const altField = page.locator('xpath=//label[normalize-space()="Alt text"]/following-sibling::input[1]');
    await expect(altField).toHaveValue("Fishing boats at the quay as the sun comes up");

    await request.delete("/api/media", { data: { url: file.url } });
  });

  test("searches the bundled photographs by what they show", async ({ page, request }) => {
    await openPicker(page, request);
    await page.getByRole("button", { name: "Stock photos" }).click();
    const cards = page.locator(".grid > div");
    await expect.poll(async () => cards.count()).toBeGreaterThan(20);

    await page.getByLabel("Search pictures").fill("gradient");
    const gradients = await cards.count();
    expect(gradients).toBeGreaterThan(0);
    expect(gradients).toBeLessThan(20);

    await page.getByLabel("Search pictures").fill("apples conveyor");
    expect(await cards.count()).toBeGreaterThan(0);

    await page.getByLabel("Search pictures").fill("no-photograph-shows-this");
    await expect(cards).toHaveCount(0);
    await expect(page.getByText(/No photograph here matches/)).toBeVisible();
  });
});
