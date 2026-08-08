import { test, expect } from "@playwright/test";

test.describe("Sites", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="password"]', "admin");
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("home page lists demo site", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Your sites");
    await expect(page.getByText("Neuravex Demo").first()).toBeVisible();
    await expect(page.locator("text=/demo/").first()).toBeVisible();
  });

  test("opens site admin page", async ({ page }) => {
    // Click the demo site card (slug "/demo")
    await page.click('text=/\\/demo/');
    await expect(page.getByRole("heading", { name: "Pages" })).toBeVisible();
    await expect(page.locator("text=Home").first()).toBeVisible();
  });

  test("creates a site via template", async ({ page }) => {
    await page.click('button:has-text("New site")');
    await page.fill('input[placeholder="My awesome site"]', "Playwright Test");
    await page.click('button:has-text("Choose template")');
    await page.click('button:has-text("Portfolio")'); // filter
    await page.getByText("Personal Portfolio").first().click();
    await page.click('button:has-text("Create site")');
    await page.waitForURL(/\/admin\/sites\//);
    await expect(page.getByRole("heading", { name: "Pages" })).toBeVisible();
    await expect(page.locator("text=Home").first()).toBeVisible();
  });

  test("site settings opens and has tabs", async ({ page }) => {
    await page.click('text=/\\/demo/');
    await page.click('button:has-text("Settings")');
    await expect(page.getByText("Name")).toBeVisible();
    await page.click('button:has-text("Theme")');
    await expect(page.getByText("Body font")).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });

  test("submissions section is present", async ({ page }) => {
    await page.click('text=/\\/demo/');
    await expect(page.locator("h2:has-text('Submissions')")).toBeVisible();
    await expect(page.locator("text=Choose a page")).toBeVisible();
  });
});
