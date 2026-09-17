import { test, expect } from "@playwright/test";

/**
 * Neuravex has no sign-in on purpose: it runs on your machine and the browser
 * that reaches it is yours. That holds for what you type in the address bar,
 * but not for the other tabs — any page on the web could post to
 * http://localhost:3000/api/… in the background, and these routes did as they
 * were told: delete a site, rewrite a page, empty the trash.
 */

const BASE = "http://localhost:3939";

test.describe("A request that changes something", () => {
  test("is refused when it comes from another site", async ({ request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Origin ${Date.now()}` } })).json();

    const res = await request.delete(`/api/sites/${site.id}?permanent=1`, {
      headers: { origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);

    // And the site it was after is still there.
    const still = await request.get(`/api/sites/${site.id}`);
    expect(still.ok()).toBe(true);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is carried out when it comes from this app", async ({ request }) => {
    const res = await request.post("/api/sites", {
      data: { name: `Origin ok ${Date.now()}` },
      headers: { origin: BASE },
    });
    expect(res.ok()).toBe(true);
    const site = await res.json();
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is left alone when it did not come from a page at all", async ({ request }) => {
    // curl, a script, the test runner: no Origin to check, and no other site
    // able to cause one. That is you at a terminal.
    const res = await request.post("/api/sites", { data: { name: `Origin none ${Date.now()}` } });
    expect(res.ok()).toBe(true);
    const site = await res.json();
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("still reads happily from anywhere, since reading changes nothing", async ({ request }) => {
    const res = await request.get("/api/sites", { headers: { origin: "https://evil.example" } });
    expect(res.ok()).toBe(true);
  });
});

test.describe("The builder itself", () => {
  test("still saves, which is the thing the check must not break", async ({ page, request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Saves ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: {
        published: true,
        content: [{ id: "a", type: "text", props: { text: "Before", align: "left", size: "base", color: "" } }],
      },
    });

    await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);
    await page.waitForSelector(".public-canvas");
    await page.locator(".public-canvas .inline-editable").first().click();
    await page.keyboard.type(" and after");
    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });

    const saved = await (await request.get(`/api/pages/${pages[0].id}`)).json();
    expect(saved.content).toContain("and after");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
