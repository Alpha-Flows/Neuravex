import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFromZip } from "./zip";

/**
 * A site's content beyond its pages: posts and their feed, a synced block
 * kept the same on every page, the site's own "not found" page, a copy of the
 * whole site, and templates of one's own.
 */

const text = (id: string, words: string) => ({ id, type: "text", props: { text: words, align: "left", size: "base", color: "" } });
const heading = (id: string, words: string) => ({ id, type: "heading", props: { text: words, level: 1, align: "left", color: "", weight: "bold" } });

async function newSite(request: APIRequestContext, content: unknown[] = [text("t", "Home words")]) {
  const site = await (await request.post("/api/sites", { data: { name: `Content ${Date.now()}${Math.random()}` } })).json();
  const home = (await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json())[0];
  await request.put(`/api/pages/${home.id}/save`, { data: { published: true, content } });
  return { site, homeId: home.id as string };
}

async function addPage(request: APIRequestContext, siteId: string, title: string, content: unknown[], extra: Record<string, unknown> = {}) {
  const page = await (await request.post(`/api/sites/${siteId}/pages`, { data: { title, slug: title.toLowerCase().replace(/\s+/g, "-") } })).json();
  await request.put(`/api/pages/${page.id}/save`, { data: { published: true, content, ...extra } });
  return page as { id: string; slug: string };
}

const content = async (request: APIRequestContext, pageId: string) => JSON.parse((await (await request.get(`/api/pages/${pageId}`)).json()).content);
const saved = (page: Page) => expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });

test.describe("Blog posts", () => {
  test("are written as posts, listed on a Blog page made for them, left out of the menu, and fed", async ({ page, request }) => {
    const { site } = await newSite(request);
    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: "+ New post" }).click();
    await page.getByLabel("Title").fill("Spring notes");
    await page.getByRole("button", { name: "Create post" }).click();
    await page.waitForURL(/\/pages\//);

    // The post's details, in the page settings on the right.
    await page.getByLabel("Author").fill("Ada");
    await page.getByLabel("Summary").fill("What grew, and what did not.");
    await page.getByLabel("Tags").fill("garden, spring");
    await expect(page.locator(".public-canvas .nvx-post-head h1")).toHaveText("Spring notes");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await saved(page);

    // The first post brought a Blog page with a posts block, as a draft.
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const blog = pages.find((p: { slug: string }) => p.slug === "blog");
    expect(blog.published).toBe(false);
    await request.put(`/api/pages/${blog.id}/save`, { data: { published: true } });

    await page.goto(`/sites/${site.slug}/blog`);
    const card = page.locator("article.nvx-post-card").filter({ hasText: "Spring notes" });
    await expect(card.getByRole("link", { name: "Spring notes" })).toHaveAttribute("href", `/sites/${site.slug}/spring-notes`);
    await expect(card).toContainText("What grew, and what did not.");
    await expect(card).toContainText("garden");
    await expect(page.locator('nav[data-nav="desktop"]')).toContainText("Blog");
    await expect(page.locator('nav[data-nav="desktop"]')).not.toContainText("Spring notes");

    await page.goto(`/sites/${site.slug}/spring-notes`);
    const head = page.locator(".nvx-post-head");
    await expect(head.getByRole("heading", { level: 1 })).toHaveText("Spring notes");
    await expect(head).toContainText("Ada");
    await expect(head.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T12:00:00/);
    await expect(page.locator('link[rel="alternate"][type="application/atom+xml"]')).toHaveCount(1);

    const feed = await request.get(`/sites/${site.slug}/feed.xml`);
    expect(feed.headers()["content-type"]).toContain("application/atom+xml");
    expect(await feed.text()).toContain("<title>Spring notes</title>");

    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    expect(readFromZip(archive, "feed.xml")).toContain('href="spring-notes.html"');
    expect(readFromZip(archive, "blog.html")).toContain('href="spring-notes.html"');
    expect(readFromZip(archive, "index.html")).toMatch(/<link rel="alternate" type="application\/atom\+xml"[^>]*href="feed.xml"/);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A synced block", () => {
  test("changed on one page is changed on every page, and an editor left open does not undo it", async ({ page, context, request }) => {
    const { site, homeId } = await newSite(request, [text("t", "Open every day")]);
    const other = await addPage(request, site.id, "Other", [text("o", "Other page")]);

    // Kept in sync from the inspector on the home page.
    await page.goto(`/admin/sites/${site.id}/pages/${homeId}`);
    await page.locator(".public-canvas .editor-block").filter({ hasText: "Open every day" }).first().click();
    const inspector = page.locator("aside").last();
    await inspector.getByRole("button", { name: "Save for reuse" }).click();
    await inspector.getByPlaceholder("Pricing section").fill("Opening hours");
    await inspector.getByLabel("Keep every copy the same").check();
    await inspector.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".public-canvas [data-synced-badge]")).toHaveCount(1);
    await saved(page);

    // Put on the other page from the palette.
    const second = await context.newPage();
    await second.goto(`/admin/sites/${site.id}/pages/${other.id}`);
    await second.getByRole("button", { name: "Insert Opening hours" }).click();
    await expect(second.locator(".public-canvas [data-synced-badge]")).toHaveCount(1);
    await saved(second);

    // Edited there...
    const words = second.locator(".public-canvas .inline-editable").filter({ hasText: "Open every day" });
    await words.click();
    await second.keyboard.press("End");
    await second.keyboard.type(", nine to five");
    await saved(second);

    // ...it is edited on the home page too.
    await expect.poll(async () => JSON.stringify(await content(request, homeId))).toContain("Open every day, nine to five");

    // The home page's editor is still open with the old copy. An unrelated
    // change there is saved without putting the old words back.
    await page.bringToFront();
    await page.getByLabel("Page URL").fill("start");
    await saved(page);
    expect(JSON.stringify(await content(request, homeId))).toContain("Open every day, nine to five");
    expect(JSON.stringify(await content(request, other.id))).toContain("Open every day, nine to five");
    await expect(page.locator(".public-canvas").getByText("Open every day, nine to five")).toBeVisible();

    const rows = await (await request.get("/api/saved-blocks")).json();
    for (const r of rows.filter((r: { name: string }) => r.name === "Opening hours")) await request.delete(`/api/saved-blocks/${r.id}`);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A site's own 'not found' page", () => {
  test("is shown with a 404 at any address that finds nothing, and downloaded as 404.html", async ({ page, request }) => {
    const { site } = await newSite(request);
    const lost = await addPage(request, site.id, "Lost", [heading("h", "Nothing lives here")]);
    await page.goto(`/admin/sites/${site.id}/pages/${lost.id}`);
    await page.getByLabel("Show this page when an address finds nothing").check();
    await saved(page);

    const response = await page.goto(`/sites/${site.slug}/no/such/page`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Nothing lives here" })).toBeVisible();
    // With the site's own header, and not in its menu.
    await expect(page.locator("header")).toContainText(site.name);
    await expect(page.locator('nav[data-nav="desktop"]')).not.toContainText("Lost");

    // A site that does not exist still gets the plain message.
    await page.goto("/sites/no-such-site-at-all");
    await expect(page.getByText("Page not found")).toBeVisible();

    expect(await (await request.get(`/sites/${site.slug}/sitemap.xml`)).text()).not.toContain("/lost");
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const notFound = readFromZip(archive, "404.html") ?? "";
    expect(notFound).toContain("Nothing lives here");
    expect(notFound).toContain('<base href="/">');
    expect(readFromZip(archive, "lost.html")).toBeNull();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A whole site", () => {
  test("is duplicated with its pages, and the copy's links go to the copy", async ({ page, request }) => {
    const { site, homeId } = await newSite(request, [
      { id: "b", type: "button", props: { label: "About us", href: "", variant: "primary", size: "md", align: "left", color: "", textColor: "" } },
    ]);
    await addPage(request, site.id, "About", [text("a", "About words")]);
    await request.put(`/api/pages/${homeId}/save`, {
      data: { content: [{ id: "b", type: "button", props: { label: "About us", href: `/sites/${site.slug}/about`, variant: "primary", size: "md", align: "left", color: "", textColor: "" } }] },
    });

    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: "Duplicate site" }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/admin/sites/") && !url.pathname.endsWith(site.id));
    const copyId = page.url().split("/").pop()!;
    const copy = await (await request.get(`/api/sites/${copyId}`)).json();
    expect(copy.name).toBe(`${site.name} (copy)`);
    expect(copy.pages).toHaveLength(2);
    const home = copy.pages.find((p: { isHome: boolean }) => p.isHome);
    expect(home.content).toContain(`/sites/${copy.slug}/about`);
    expect(home.content).not.toContain(`/sites/${site.slug}/about`);

    await request.delete(`/api/sites/${copyId}?permanent=1`);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Templates of one's own", () => {
  test("are kept from a site and a page, and offered when making the next", async ({ page, request }) => {
    const { site, homeId } = await newSite(request, [heading("h", "Mine, all mine")]);
    const name = `Starter ${Date.now()}`;

    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: "Save as template" }).click();
    await page.getByLabel("Template name").fill(name);
    await page.getByRole("button", { name: "Keep", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(`Kept as "${name}"`);

    // A new site from it.
    await page.goto("/");
    await page.getByRole("button", { name: "+ New site" }).first().click();
    await page.getByLabel("Name").fill("Made from mine");
    await page.getByRole("button", { name: "Choose template →" }).click();
    await page.getByRole("button", { name: new RegExp(name) }).first().click();
    await page.getByRole("button", { name: "Create site" }).click();
    await page.waitForURL(/\/admin\/sites\/[^/]+$/);
    const madeId = page.url().split("/").pop()!;
    const made = await (await request.get(`/api/sites/${madeId}`)).json();
    expect(made.name).toBe("Made from mine");
    expect(made.pages[0].content).toContain("Mine, all mine");

    // A page kept from the editor, offered when adding a page.
    const pageName = `Page ${Date.now()}`;
    await page.goto(`/admin/sites/${site.id}/pages/${homeId}`);
    await page.getByRole("button", { name: "Save page as template" }).click();
    await page.getByLabel("Template name").fill(pageName);
    await page.getByRole("button", { name: "Keep", exact: true }).click();
    // By its words: the editor's drag and drop keeps a live status region of its own.
    await expect(page.getByRole("status").filter({ hasText: "Kept as" })).toBeVisible();

    await page.goto(`/admin/sites/${madeId}`);
    await page.getByRole("button", { name: "+ New page" }).click();
    await page.getByLabel("Title").fill("Again");
    await page.getByRole("button", { name: pageName }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/pages\//);
    await expect(page.locator(".public-canvas")).toContainText("Mine, all mine");

    for (const kind of ["site", "page"]) {
      const list = await (await request.get(`/api/user-templates?kind=${kind}`)).json();
      for (const t of list.filter((t: { name: string }) => t.name === name || t.name === pageName)) await request.delete(`/api/user-templates/${t.id}`);
    }
    await request.delete(`/api/sites/${madeId}?permanent=1`);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
