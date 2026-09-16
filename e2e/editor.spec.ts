import { test, expect } from "@playwright/test";

test.describe("Editor", () => {
  test("editor page loads and renders the header", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/");
    await page.locator('a[href*="/admin/sites/"]').first().click();
    await page.waitForLoadState("domcontentloaded");
    // Click the first Edit button
    await page.getByRole("link", { name: "Edit" }).first().click({ timeout: 10000 });
    await expect(page.locator("header")).toBeVisible({ timeout: 30000 });
  });
});
