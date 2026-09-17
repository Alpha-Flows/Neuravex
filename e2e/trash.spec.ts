import { test, expect, APIRequestContext } from "@playwright/test";

async function siteWithEverything(request: APIRequestContext) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Trash ${Date.now()}${Math.random()}` } })
  ).json();
  await request.patch(`/api/sites/${site.id}`, {
    data: { headerShape: "pill", headerOpacity: 42, language: "de", favicon: "/uploads/i.png", accent: "#059669" },
  });
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  const home = pages[0];
  await request.put(`/api/pages/${home.id}/save`, {
    data: {
      title: "Home",
      published: true,
      metaTitle: "Home | Trash",
      reason: "manual",
      content: [{ id: "h", type: "heading", props: { text: "Keep me", level: 1, align: "left", color: "", weight: "bold" } }],
    },
  });
  await request.post("/api/submissions", { data: { pageId: home.id, data: { name: "A visitor" } } });
  const about = await (
    await request.post(`/api/sites/${site.id}/pages`, { data: { title: "About", slug: "about" } })
  ).json();
  return { site, home, about };
}

const trash = async (request: APIRequestContext) => (await (await request.get("/api/trash")).json()) as {
  id: string; kind: string; label: string; siteName: string | null;
}[];

test.describe("Deleting a site", () => {
  test("keeps it whole, and puts it back with its pages, settings and submissions", async ({ request }) => {
    const { site, home } = await siteWithEverything(request);

    expect((await request.delete(`/api/sites/${site.id}`)).status()).toBe(200);
    expect((await request.get(`/api/sites/${site.id}`)).status()).toBe(404);
    expect((await request.get(`/sites/${site.slug}`)).status()).toBe(404);

    const entry = (await trash(request)).find((t) => t.label === site.name);
    expect(entry, "the deleted site is in the trash").toBeTruthy();
    expect(entry!.kind).toBe("site");

    const restored = await (await request.post(`/api/trash/${entry!.id}`, { data: {} })).json();
    const back = await (await request.get(`/api/sites/${restored.id}`)).json();
    expect(back.name).toBe(site.name);
    expect(back.headerShape).toBe("pill");
    expect(back.headerOpacity).toBe(42);
    expect(back.language).toBe("de");
    expect(back.favicon).toBe("/uploads/i.png");
    expect(back.pages).toHaveLength(2);

    const restoredHome = back.pages.find((p: { isHome: boolean }) => p.isHome);
    expect(restoredHome.metaTitle).toBe("Home | Trash");
    expect(restoredHome.content).toContain("Keep me");

    // The answers people sent through the form came back too.
    const subs = await (await request.get(`/api/pages/${restoredHome.id}/submissions`)).json();
    expect(subs).toHaveLength(1);
    expect(subs[0].data).toContain("A visitor");

    // Its history survived the round trip.
    const revs = await (await request.get(`/api/pages/${restoredHome.id}/revisions`)).json();
    expect(revs.length).toBeGreaterThan(0);

    // And it is out of the trash now.
    expect((await trash(request)).find((t) => t.id === entry!.id)).toBeUndefined();
    expect((await request.get(`/api/pages/${home.id}`)).status()).toBe(404);

    await request.delete(`/api/sites/${restored.id}?permanent=1`);
  });

  test("says what it would take with it before anything happens", async ({ request }) => {
    const { site } = await siteWithEverything(request);
    const cost = await (await request.get(`/api/sites/${site.id}?cost=1`)).json();
    expect(cost).toMatchObject({ name: site.name, pages: 2, submissions: 1 });
    expect(cost.revisions).toBeGreaterThan(0);
    // Asking did not delete anything.
    expect((await request.get(`/api/sites/${site.id}`)).status()).toBe(200);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Deleting a page", () => {
  test("puts it back into the site it came from", async ({ request }) => {
    const { site, about } = await siteWithEverything(request);
    await request.delete(`/api/pages/${about.id}`);

    const entry = (await trash(request)).find((t) => t.label === "About");
    expect(entry?.siteName).toBe(site.name);

    await request.post(`/api/trash/${entry!.id}`, { data: {} });
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    expect(pages.map((p: { title: string }) => p.title)).toContain("About");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("explains itself when the site it belonged to is gone too", async ({ request }) => {
    const { site, about } = await siteWithEverything(request);
    await request.delete(`/api/pages/${about.id}`);
    const pageEntry = (await trash(request)).find((t) => t.label === "About")!;
    await request.delete(`/api/sites/${site.id}`);

    const res = await request.post(`/api/trash/${pageEntry.id}`, { data: {} });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain("Restore the site instead");

    const siteEntry = (await trash(request)).find((t) => t.label === site.name)!;
    const restored = await (await request.post(`/api/trash/${siteEntry.id}`, { data: {} })).json();
    await request.delete(`/api/trash/${pageEntry.id}`);
    await request.delete(`/api/sites/${restored.id}?permanent=1`);
  });
});

test.describe("The trash itself", () => {
  test("can throw one entry away for good", async ({ request }) => {
    const { site } = await siteWithEverything(request);
    await request.delete(`/api/sites/${site.id}`);
    const entry = (await trash(request)).find((t) => t.label === site.name)!;

    await request.delete(`/api/trash/${entry.id}`);
    expect((await trash(request)).find((t) => t.id === entry.id)).toBeUndefined();
  });
});

test.describe("The builder", () => {
  test("offers what was deleted back, from the sites list", async ({ page, request }) => {
    const { site } = await siteWithEverything(request);
    await request.delete(`/api/sites/${site.id}`);

    await page.goto("/");
    await page.getByRole("button", { name: /Trash/ }).click();
    await expect(page.getByText(site.name, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Put back" }).first().click();
    await expect(page.getByRole("link", { name: new RegExp(site.name) })).toBeVisible({ timeout: 10000 });

    const sites = await (await request.get("/api/sites")).json();
    const back = sites.find((s: { name: string }) => s.name === site.name);
    await request.delete(`/api/sites/${back.id}?permanent=1`);
  });

  test("asks before deleting a page, and counts what goes with it", async ({ page, request }) => {
    const { site } = await siteWithEverything(request);
    await page.goto(`/admin/sites/${site.id}`);

    await page.getByRole("button", { name: "Delete" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("goes to the trash");
    await expect(dialog).toContainText("form submission");

    await page.getByRole("button", { name: "Cancel" }).click();
    // Cancelling really cancels.
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    expect(pages).toHaveLength(2);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
