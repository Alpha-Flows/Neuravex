import { test, expect } from "@playwright/test";

test.describe("Auth", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText("Neuravex");
  });

  test("login redirects back to original page", async ({ page }) => {
    await page.goto("/admin/sites/some-id");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.fill('input[type="password"]', "admin");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("shows error on wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="password"]', "wrong");
    await page.click('button[type="submit"]');
    await expect(page.locator(".text-red-400")).toContainText("Wrong password");
  });

  test("public site is accessible without auth", async ({ page }) => {
    await page.goto("/sites/demo");
    await expect(page.locator("header")).toBeVisible();
  });
});
