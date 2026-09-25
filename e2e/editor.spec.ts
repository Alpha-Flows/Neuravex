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

/**
 * Things the editor must not do behind your back.
 *
 * Each of these was found by driving the real editor: a keystroke that
 * changed the page with nothing on screen to show it, a link that walked out
 * of the builder, and a panel that selected something you could not see.
 */
import { APIRequestContext, Page } from "@playwright/test";

const line = (id: string, text: string) => ({
  id, type: "text", props: { text, align: "left", size: "base", color: "" },
});

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Editor ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  return { site, page: pages[0] };
}

async function openEditor(page: Page, siteId: string, pageId: string) {
  await page.goto(`/admin/sites/${siteId}/pages/${pageId}`);
  await page.waitForSelector(".public-canvas");
  await page.waitForTimeout(700);
}

const blockCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll(".public-canvas .editor-block").length);

test.describe("While previewing", () => {
  test("a keystroke does not quietly throw a block away", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [1, 2, 3, 4, 5].map((n) => line(`t${n}`, `Line ${n}`)));
    await openEditor(page, site.id, p.id);

    const before = await blockCount(page);
    // Something is selected, then Preview hides every sign of it.
    await page.locator(".public-canvas .editor-block").first().click();
    await page.getByRole("banner").getByRole("button", { name: "Preview", exact: true }).click();
    await page.waitForTimeout(300);

    await page.keyboard.press("Delete");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);
    await page.getByRole("banner").getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForTimeout(300);

    expect(await blockCount(page)).toBe(before);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A link on the canvas", () => {
  test("does not walk out of the builder", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [line("a", "On the page")]);
    await openEditor(page, site.id, p.id);

    // The site's own nav is rendered for real, so these are real links.
    const links = page.locator(".public-canvas a[href]");
    expect(await links.count()).toBeGreaterThan(0);

    const before = page.url();
    await links.first().click({ force: true });
    await page.waitForTimeout(900);
    expect(page.url()).toBe(before);
    await expect(page.locator(".public-canvas")).toBeVisible();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Picking a block in the outline", () => {
  test("brings it into view instead of selecting something off screen", async ({ page, request }) => {
    const { site, page: p } = await siteWith(
      request,
      Array.from({ length: 60 }, (_, i) => line(`t${i}`, `Line ${i + 1}`)),
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await openEditor(page, site.id, p.id);

    await page.getByRole("button", { name: "outline", exact: true }).click();
    await page.waitForTimeout(300);
    const entries = page.locator("aside").first().locator("button");
    await entries.nth((await entries.count()) - 1).click();
    await page.waitForTimeout(500);

    const seen = await page.evaluate(() => {
      const frame = document.querySelector("[data-canvas-frame]")!.getBoundingClientRect();
      const sel = document.querySelector(".editor-block.is-selected");
      if (!sel) return null;
      const r = sel.getBoundingClientRect();
      return r.top < frame.bottom && r.bottom > frame.top;
    });
    // It used to leave the canvas where it was and open the inspector for a
    // block still a thousand pixels down, so the outline read as broken.
    expect(seen).toBe(true);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("leaves the canvas alone when the block is already on screen", async ({ page, request }) => {
    const { site, page: p } = await siteWith(
      request,
      Array.from({ length: 60 }, (_, i) => line(`t${i}`, `Line ${i + 1}`)),
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await openEditor(page, site.id, p.id);

    await page.evaluate(() => { (document.querySelector("[data-canvas-frame]") as HTMLElement).scrollTop = 400; });
    await page.waitForTimeout(200);
    const at = await page.evaluate(() => (document.querySelector("[data-canvas-frame]") as HTMLElement).scrollTop);

    // A block already in view must not make the page jump under the pointer.
    await page.locator(".public-canvas .editor-block").nth(20).click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (document.querySelector("[data-canvas-frame]") as HTMLElement).scrollTop)).toBe(at);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A shortcut key", () => {
  test("pressed in the inspector is about the inspector", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [line("a", "First"), line("b", "Second")]);
    await openEditor(page, site.id, p.id);

    const before = await blockCount(page);
    await page.locator(".public-canvas .editor-block").first().click();
    // A button in the panel, as a keyboard user would reach it by Tab.
    await page.locator("[data-inspector] button").last().focus();
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);
    expect(await blockCount(page)).toBe(before);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("pressed on an outline row is about the block it names", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [line("a", "First"), line("b", "Second")]);
    await openEditor(page, site.id, p.id);

    const before = await blockCount(page);
    await page.getByRole("button", { name: "outline" }).click();
    await page.getByRole("treeitem").first().click();
    // The left rail is an aside as well, and taking every aside for a panel
    // left a block picked here beyond the reach of the keyboard.
    await page.keyboard.press("Delete");
    await expect.poll(() => blockCount(page)).toBe(before - 1);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A revision's preview", () => {
  test("does not follow its links out of the editor", async ({ page, request }) => {
    const button = { id: "go", type: "button", props: { label: "Somewhere else", href: "https://example.com/", variant: "primary", size: "md", align: "left" } };
    const { site, page: p } = await siteWith(request, [line("a", "Before"), button]);
    // A second save, so there is a revision whatever the first one kept.
    await request.put(`/api/pages/${p.id}/save`, { data: { published: true, content: [line("a", "After"), button] } });
    await openEditor(page, site.id, p.id);

    const editorUrl = page.url();
    await page.getByRole("button", { name: "Preview", exact: true }).and(page.locator("aside button")).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("link", { name: "Somewhere else" }).click();
    await page.waitForTimeout(300);

    // Following it used to leave the editor, and whatever was unsaved with it.
    expect(page.url()).toBe(editorUrl);
    await expect(dialog).toBeVisible();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
