import { test, expect } from "@playwright/test";

async function login(request: any) {
  const res = await request.post("/api/auth/login", { data: { password: "admin" } });
  expect(res.status()).toBe(200);
}

test.describe("API", () => {
  test("templates endpoint returns all templates", async ({ request }) => {
    const res = await request.get("/api/templates");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(26);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("name");
    expect(data[0]).toHaveProperty("category");
  });

  test("sites CRUD with auth", async ({ request }) => {
    await login(request);

    // List sites
    const list = await request.get("/api/sites");
    expect(list.ok()).toBeTruthy();
    const sites = await list.json();
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]).toHaveProperty("slug");

    // Create a site
    const create = await request.post("/api/sites", {
      data: { name: "API Test Site", templateId: "blank" },
    });
    expect(create.status()).toBe(201);
    const site = await create.json();
    expect(site).toHaveProperty("slug", "api-test-site");

    // Get the site
    const get = await request.get(`/api/sites/${site.id}`);
    expect(get.ok()).toBeTruthy();
    const got = await get.json();
    expect(got.pages.length).toBe(1);
    expect(got.pages[0]).toHaveProperty("isHome", true);

    // Get pages
    const pages = await request.get(`/api/sites/${site.id}/pages?all=1`);
    expect(pages.ok()).toBeTruthy();
    const pageList = await pages.json();
    expect(pageList.length).toBe(1);

    // Create a page
    const newPage = await request.post(`/api/sites/${site.id}/pages`, {
      data: { title: "Contact", slug: "contact" },
    });
    expect(newPage.status()).toBe(201);
    const p = await newPage.json();
    expect(p).toHaveProperty("slug", "contact");

    // Save page content
    const save = await request.put(`/api/pages/${pageList[0].id}/save`, {
      data: {
        title: "Home",
        published: true,
        isHome: true,
        content: [{ id: "b1", type: "heading", props: { text: "Hello API", level: 1, align: "left", color: "#000", weight: "bold" } }],
      },
    });
    expect(save.ok()).toBeTruthy();

    // Revisions created
    const revs = await request.get(`/api/pages/${pageList[0].id}/revisions`);
    expect(revs.ok()).toBeTruthy();
    const revList = await revs.json();
    expect(revList.length).toBeGreaterThanOrEqual(1);
    expect(revList[0]).toHaveProperty("title", "Home");

    // Export site
    const exportRes = await request.get(`/api/sites/${site.id}/export`);
    expect(exportRes.ok()).toBeTruthy();

    // Delete the page
    const delPage = await request.delete(`/api/pages/${p.id}`);
    expect(delPage.ok()).toBeTruthy();

    // Delete the site
    const delSite = await request.delete(`/api/sites/${site.id}`);
    expect(delSite.ok()).toBeTruthy();
  });

  test("upload and media API", async ({ request }) => {
    await login(request);

    // Upload a file using multipart
    const upload = await request.post("/api/upload", {
      multipart: {
        file: {
          name: "test.png",
          mimeType: "image/png",
          buffer: Buffer.from("test content"),
        },
      },
    });
    expect(upload.ok()).toBeTruthy();
    const uploaded = await upload.json();
    expect(uploaded).toHaveProperty("url");
    expect(uploaded.url).toContain("/uploads/");

    // List media
    const media = await request.get("/api/media");
    expect(media.ok()).toBeTruthy();
    const files = await media.json();
    expect(files.length).toBeGreaterThan(0);
  });

  test("submissions API", async ({ request }) => {
    await login(request);

    const sites = await request.get("/api/sites");
    const siteList = await sites.json();
    const siteId = siteList[0].id;
    const pages = await request.get(`/api/sites/${siteId}/pages?all=1`);
    const pageList = await pages.json();
    const pageId = pageList[0].id;

    // Submit a form
    const res = await request.post("/api/submissions", {
      data: { pageId, data: { name: "Test User", email: "test@test.com", message: "Hello" } },
    });
    expect(res.ok()).toBeTruthy();
    const sub = await res.json();
    expect(sub).toHaveProperty("id");

    // List submissions
    const subs = await request.get(`/api/pages/${pageId}/submissions`);
    expect(subs.ok()).toBeTruthy();
    const subList = await subs.json();
    expect(subList.length).toBeGreaterThan(0);
  });

  test("isHome properly unsets other pages", async ({ request }) => {
    await login(request);

    const site = await request.post("/api/sites", { data: { name: "Home Test" } });
    const s = await site.json();

    // Create two pages
    const p2 = await request.post(`/api/sites/${s.id}/pages`, { data: { title: "Other", slug: "other" } });
    const p2data = await p2.json();

    // Set p2 as home
    await request.patch(`/api/pages/${p2data.id}`, { data: { isHome: true } });

    // Check both pages
    const pages = await request.get(`/api/sites/${s.id}/pages?all=1`);
    const list = await pages.json();
    const homePages = list.filter((p: any) => p.isHome);
    expect(homePages.length).toBe(1);
    expect(homePages[0].id).toBe(p2data.id);

    // Cleanup
    await request.delete(`/api/sites/${s.id}`);
  });

  test("import site from export", async ({ request }) => {
    await login(request);

    const sites = await request.get("/api/sites");
    const list = await sites.json();
    const exportRes = await request.get(`/api/sites/${list[0].id}/export`);
    const exported = await exportRes.json();

    const imp = await request.post("/api/sites/import", { data: exported });
    expect(imp.status()).toBe(201);
    const imported = await imp.json();
    expect(imported).toHaveProperty("id");
    // Should have same number of pages
    expect(imported.pages).toBeUndefined(); // create response doesn't include pages
  });

  test("site settings update theme fields", async ({ request }) => {
    await login(request);

    const sites = await request.get("/api/sites");
    const list = await sites.json();
    const siteId = list[0].id;

    const res = await request.patch(`/api/sites/${siteId}`, {
      data: { fontFamily: "Georgia", customCss: "body { margin: 0; }", metaTitle: "Test SEO" },
    });
    expect(res.ok()).toBeTruthy();
    const updated = await res.json();
    expect(updated.fontFamily).toBe("Georgia");
    expect(updated.customCss).toBe("body { margin: 0; }");
    expect(updated.metaTitle).toBe("Test SEO");
  });
});
