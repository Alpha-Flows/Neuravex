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
    const nav = page.locator("header nav");
    await expect(nav.locator('a:has-text("Home")')).toBeVisible();
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
