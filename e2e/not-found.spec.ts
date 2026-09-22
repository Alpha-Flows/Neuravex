import { test, expect } from "@playwright/test";

/**
 * The 404 pages, and — more to the point — where they render.
 *
 * Both root layouts in this app live inside route groups, and each emits its
 * own `<html>`. A single `not-found.tsx` at `src/app/` would sit above both of
 * them, outside either document, and would also stop Next inserting its own
 * boundary at the group roots. It would still look roughly right in a
 * screenshot, which is why these assert on the document around the message
 * rather than only on the message.
 */

test.describe("A page that is not there", () => {
  test("answers 404 on a published site, in the site's own document", async ({ page }) => {
    const res = await page.goto("/sites/nonexistent-xyz");

    // The status is what a search engine and a link checker read, and it has
    // to survive the boundary being added.
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();

    // Rendered *inside* the published root layout: that layout is the only
    // thing that emits <html lang> for this half of the app, and the white
    // surface comes from the class it wraps its pages in rather than from
    // globals.css, which paints every document in the builder's black.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator(".public-canvas")).toHaveCount(1);
  });

  test("says nothing about the software behind the site", async ({ page }) => {
    // A visitor is looking at somebody's public website. What runs it, and
    // what went wrong, is not their business.
    await page.goto("/sites/nonexistent-xyz");
    await expect(page.locator("body")).not.toContainText("Neuravex");
  });

  test("answers 404 in the builder, in the builder's own chrome", async ({ page }) => {
    const res = await page.goto("/admin/sites/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("That page is not here")).toBeVisible();

    // And it offers the way out that Next's stock page does not.
    await expect(page.getByRole("link", { name: "All sites" })).toBeVisible();
  });

  test("answers 404 for a page that belongs to another site", async ({ page, request }) => {
    // The third `notFound()` call: a real site, a real page, wrong pairing.
    const a = await (await request.post("/api/sites", { data: { name: `NF a ${Date.now()}` } })).json();
    const b = await (await request.post("/api/sites", { data: { name: `NF b ${Date.now()}` } })).json();
    const pagesOfB = await (await request.get(`/api/sites/${b.id}/pages?all=1`)).json();

    const res = await page.goto(`/admin/sites/${a.id}/pages/${pagesOfB[0].id}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByText("That page is not here")).toBeVisible();

    await request.delete(`/api/sites/${a.id}?permanent=1`);
    await request.delete(`/api/sites/${b.id}?permanent=1`);
  });
});
