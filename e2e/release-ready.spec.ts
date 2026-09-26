import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * What a first customer meets before they meet any feature: whether it is
 * running and which version, the two ways a click could lose a whole site,
 * a database somebody else is writing, and dialogs a keyboard can use.
 */

const { version: VERSION } = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

async function newSite(request: APIRequestContext, name = "Ready") {
  const site = await (await request.post("/api/sites", { data: { name: `${name} ${Date.now()}${Math.random()}` } })).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  return { site, pageId: pages[0].id as string };
}

/** Whether the focused element is inside the open dialog. */
const focusInDialog = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest("[role='dialog']"));

test.describe("Whether it is running", () => {
  test("answers /api/health with its name, version and state", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(await res.json()).toEqual({ app: "neuravex", version: VERSION, ok: true, database: "ok", uploads: "writable", journal: "wal" });
  });

  test("says which version it is on the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-app-version]")).toHaveText(`Neuravex ${VERSION}`);
  });
});

test.describe("Deleting for good", () => {
  test("asks first, and can be talked out of it", async ({ page, request }) => {
    const { site } = await newSite(request, "Forget");
    await request.delete(`/api/sites/${site.id}`);

    await page.goto("/");
    await page.getByRole("button", { name: /Trash/ }).click();
    const row = page.locator("div.px-4.py-3").filter({ hasText: site.name });
    await row.getByRole("button", { name: "Delete forever" }).click();

    const asking = row.locator("[data-confirm-forget]");
    await expect(asking).toContainText("This is the last copy");
    await asking.getByRole("button", { name: "Keep it" }).click();
    await expect(row.getByRole("button", { name: "Put back" })).toBeVisible();
    let entries = await (await request.get("/api/trash")).json();
    expect(entries.some((e: { label: string }) => e.label === site.name)).toBe(true);

    await row.getByRole("button", { name: "Delete forever" }).click();
    await row.getByRole("button", { name: "Delete for good" }).click();
    await expect(page.getByText(site.name)).toHaveCount(0);
    entries = await (await request.get("/api/trash")).json();
    expect(entries.some((e: { label: string }) => e.label === site.name)).toBe(false);
  });

  test("a site is deleted from a danger zone, away from Save", async ({ page, request }) => {
    const { site } = await newSite(request, "Danger");
    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "Site settings" });
    await expect(settings.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(settings.getByRole("button", { name: "Delete site" })).toHaveCount(0);

    await settings.getByRole("button", { name: "Advanced" }).click();
    const zone = settings.locator("[data-danger-zone]");
    await expect(zone).toContainText("Danger zone");
    const del = zone.getByRole("button", { name: "Delete site" });
    await del.click();

    // The confirmation sits over the settings, and Escape closes only it,
    // handing focus back to the button that opened it.
    const confirm = page.getByRole("dialog").filter({ hasNotText: "Danger zone" });
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(del).toBeFocused();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A database another program is writing", () => {
  /**
   * The e2e database, held with a write lock from outside the server, the
   * way the MCP agent or a backup holds it.
   */
  async function holdTheDatabase(ms: number) {
    const file = (process.env.DATABASE_URL ?? "").replace(/^file:/, "");
    const { DatabaseSync } = (await import("node:" + "sqlite")) as {
      DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
    };
    const db = new DatabaseSync(file);
    db.exec("BEGIN IMMEDIATE");
    return new Promise<void>((done) =>
      setTimeout(() => {
        db.exec("ROLLBACK");
        db.close();
        done();
      }, ms),
    );
  }

  const heading = (words: string) => [{ id: "h", type: "heading", props: { text: words, level: 1, align: "left", color: "", weight: "bold" } }];

  test("is waited out when it lets go", async ({ request }) => {
    test.setTimeout(90_000);
    const { site, pageId } = await newSite(request, "Busy");
    const released = holdTheDatabase(7000);
    const res = await request.put(`/api/pages/${pageId}/save`, { data: { content: heading("Saved after the wait") }, timeout: 60_000 });
    await released;
    expect(res.status()).toBe(200);
    expect((await (await request.get(`/api/pages/${pageId}`)).json()).content).toContain("Saved after the wait");
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is reported in words when it does not", async ({ request }) => {
    test.setTimeout(90_000);
    const { site, pageId } = await newSite(request, "Busier");
    const released = holdTheDatabase(25_000);
    const res = await request.put(`/api/pages/${pageId}/save`, { data: { content: heading("Never written") }, timeout: 60_000 });
    expect(res.status()).toBe(503);
    expect((await res.json()).error).toMatch(/database was busy/);
    await released;
    expect((await (await request.get(`/api/pages/${pageId}`)).json()).content).not.toContain("Never written");
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Dialogs and the keyboard", () => {
  test("keep Tab inside, close on Escape and give focus back", async ({ page, request }) => {
    const { site } = await newSite(request, "Keys");
    await page.goto(`/admin/sites/${site.id}`);

    // The shared dialog.
    const opener = page.getByRole("button", { name: "Find and replace" });
    await opener.click();
    await expect(page.getByRole("dialog", { name: "Find and replace" })).toBeVisible();
    await expect(page.getByLabel("Find", { exact: true })).toBeFocused();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await focusInDialog(page)).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusInDialog(page)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();

    // One drawn by hand, which used to be no dialog at all to a screen reader.
    const newPage = page.getByRole("button", { name: "+ New page" });
    await newPage.click();
    const dialog = page.getByRole("dialog", { name: "New page" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Title")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await focusInDialog(page)).toBe(true);
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      expect(await focusInDialog(page)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(newPage).toBeFocused();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
