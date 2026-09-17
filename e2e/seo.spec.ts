import { test, expect, APIRequestContext } from "@playwright/test";

async function publishedSite(request: APIRequestContext) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Seo ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, {
    data: { title: "Home", published: true, content: [
      { id: "h", type: "heading", props: { text: "Welcome", level: 1, align: "left", color: "", weight: "bold" } },
    ] },
  });
  const about = await (
    await request.post(`/api/sites/${site.id}/pages`, { data: { title: "About", slug: "about" } })
  ).json();
  await request.put(`/api/pages/${about.id}/save`, { data: { title: "About", published: true, content: [] } });
  await request.post(`/api/sites/${site.id}/pages`, { data: { title: "Draft", slug: "draft" } });
  return { site, home: pages[0], about };
}

test.describe("A published site tells search engines about itself", () => {
  test("serves a sitemap of its published pages only", async ({ request }) => {
    const { site } = await publishedSite(request);
    const res = await request.get(`/sites/${site.slug}/sitemap.xml`);

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain(`/sites/${site.slug}</loc>`);
    expect(xml).toContain(`/sites/${site.slug}/about</loc>`);
    expect(xml).not.toContain("/draft</loc>");

    await request.delete(`/api/sites/${site.id}`);
  });

  test("serves a robots.txt that points at the sitemap", async ({ request }) => {
    const { site } = await publishedSite(request);
    const res = await request.get(`/sites/${site.slug}/robots.txt`);
    expect(res.status()).toBe(200);
    const txt = await res.text();
    expect(txt).toContain("Allow: /");
    expect(txt).toContain(`/sites/${site.slug}/sitemap.xml`);
    await request.delete(`/api/sites/${site.id}`);
  });

  test("asks not to be indexed while nothing is published", async ({ request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Draft ${Date.now()}` } })).json();
    const txt = await (await request.get(`/sites/${site.slug}/robots.txt`)).text();
    expect(txt).toContain("Disallow: /");
    await request.delete(`/api/sites/${site.id}`);
  });

  test("404s for a site that does not exist", async ({ request }) => {
    expect((await request.get("/sites/no-such-site/sitemap.xml")).status()).toBe(404);
    expect((await request.get("/sites/no-such-site/robots.txt")).status()).toBe(404);
  });
});

test.describe("A published page's head", () => {
  test("carries a canonical address, the site's language and its favicon", async ({ page, request }) => {
    const { site } = await publishedSite(request);
    await request.patch(`/api/sites/${site.id}`, {
      data: { language: "pt-BR", favicon: "/uploads/icon.png" },
    });

    await page.goto(`/sites/${site.slug}/about`);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `/sites/${site.slug}/about`);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/uploads/icon.png");

    await request.delete(`/api/sites/${site.id}`);
  });

  test("the home page's canonical is the site address, not the index slug", async ({ page, request }) => {
    const { site } = await publishedSite(request);
    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `/sites/${site.slug}`);
    await request.delete(`/api/sites/${site.id}`);
  });

  test("a visitor's page does not carry the builder's own theme", async ({ page, request }) => {
    const { site } = await publishedSite(request);
    await page.goto(`/sites/${site.slug}`);
    const cls = (await page.locator("body").getAttribute("class")) ?? "";
    expect(cls).not.toContain("bg-bg");
    expect(cls).not.toContain("text-fg");
    await request.delete(`/api/sites/${site.id}`);
  });
});

test.describe("Images on a published page", () => {
  test("load lazily", async ({ page, request }) => {
    const { site, home } = await publishedSite(request);
    await request.put(`/api/pages/${home.id}/save`, {
      data: { content: [
        { id: "i", type: "image", props: { src: "/stock/nature/pietro-de-grandi-Q5dMq3cKqec-unsplash.jpg", alt: "A lake", rounded: "xl", width: "large", caption: "" } },
      ] },
    });
    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator("img").first()).toHaveAttribute("loading", "lazy");
    await request.delete(`/api/sites/${site.id}`);
  });
});

test.describe("The download", () => {
  test("includes a robots.txt", async ({ request }) => {
    const { site } = await publishedSite(request);
    const zip = await (await request.get(`/api/sites/${site.id}/download`)).body();
    expect(zip.toString("binary")).toContain("robots.txt");
    await request.delete(`/api/sites/${site.id}`);
  });
});
