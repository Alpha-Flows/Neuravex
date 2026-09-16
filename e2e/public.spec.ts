import { test, expect } from "@playwright/test";

test.describe("Public site", () => {
  test("demo site renders with header, content, and footer", async ({ page }) => {
    await page.goto("/sites/demo");
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
    // Quote blocks also use <footer>, so use the contentinfo role for the site footer
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("demo site has navigation with Home link", async ({ page }) => {
    await page.goto("/sites/demo");
    const nav = page.locator('header nav[data-nav="desktop"]');
    await expect(nav.locator('a:has-text("Home")')).toBeVisible();
  });

  test("nav collapses into a menu on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sites/demo");
    await expect(page.locator('header nav[data-nav="desktop"]')).toBeHidden();
    await expect(page.locator('header nav[data-nav="mobile"]')).toBeHidden();
    await page.locator("header details summary").click();
    await expect(page.locator('header nav[data-nav="mobile"] a:has-text("Home")')).toBeVisible();
  });

  test("columns stack on a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sites/demo");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    const tracks = await page.evaluate(() =>
      [...document.querySelectorAll(".nvx-columns-grid")].map(
        (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length,
      ),
    );
    for (const t of tracks) expect(t).toBe(1);
  });

  test("demo site block content renders", async ({ page }) => {
    await page.goto("/sites/demo");
    const body = page.locator("body");
    // Content from the new SaaS landing template
    await expect(body).toContainText("Polaris");
    await expect(body).toContainText("Start building free");
    await expect(body).toContainText("Everything you need");
    await expect(body).toContainText("Lightning fast");
  });

  test("404 for nonexistent site", async ({ page }) => {
    const res = await page.goto("/sites/nonexistent-xyz");
    expect(res?.status()).toBe(404);
  });
});
