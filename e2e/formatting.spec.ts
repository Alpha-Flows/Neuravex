import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * The formatting toolbar over selected text: underline, strikethrough, a
 * colour, a highlight — the site's palette among the choices — and clearing
 * all of it again without losing a link.
 */

/** Select `length` characters of a one-line editable, starting `from` characters in. */
async function select(page: Page, editable: Locator, from: number, length: number) {
  await editable.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < from; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.down("Shift");
  for (let i = 0; i < length; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
}

const saved = (page: Page) => expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });

test.describe("Formatting selected text", () => {
  test("underlines, strikes, colours and highlights it, and clears it again", async ({ page, request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Format ${Date.now()}${Math.random()}` } })).json();
    await request.patch(`/api/sites/${site.id}`, { data: { palette: ["#0f766e"] } });
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const pageId = pages[0].id as string;
    await request.put(`/api/pages/${pageId}/save`, {
      data: {
        published: true,
        content: [{ id: "t", type: "text", props: { text: 'Alpha bravo charlie delta <a href="https://example.com">echo</a>', align: "left", size: "base", color: "" } }],
      },
    });

    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    const para = page.locator(".public-canvas .inline-editable").first();

    await select(page, para, 0, 5);
    await page.getByRole("button", { name: "Underline", exact: true }).click();
    await select(page, para, 6, 5);
    await page.getByRole("button", { name: "Strikethrough", exact: true }).click();
    await select(page, para, 12, 7);
    await page.getByRole("button", { name: "Text colour", exact: true }).click();
    await page.getByRole("group", { name: "Text colours" }).getByRole("button", { name: "Site colour 1" }).click();
    await select(page, para, 20, 5);
    await page.getByRole("button", { name: "Highlight", exact: true }).click();
    await page.getByRole("group", { name: "Highlights" }).getByRole("button", { name: "#fef08a" }).click();

    await expect(para.locator("u")).toHaveText("Alpha");
    await expect(para.locator("strike, s")).toHaveText("bravo");
    await saved(page);
    const stored = JSON.parse((await (await request.get(`/api/pages/${pageId}`)).json()).content)[0].props.text as string;
    expect(stored).toContain("<u>Alpha</u>");
    expect(stored).toContain("<s>bravo</s>");
    // The palette colour is kept as a reference to the slot, not as its hex.
    expect(stored).toContain('<span style="color:var(--site-color-1, #0f766e)">charlie</span>');
    expect(stored).toContain('<span style="background-color:rgb(254, 240, 138)">delta</span>');

    // A visitor sees all four.
    await page.goto(`/sites/${site.slug}`);
    const published = page.getByText("Alpha bravo");
    await expect(published.locator("u")).toHaveText("Alpha");
    await expect(published.locator("s")).toHaveText("bravo");
    expect(await published.getByText("charlie").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(15, 118, 110)");
    expect(await published.getByText("delta").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(254, 240, 138)");

    // Cleared, the words are plain again and the link is still a link.
    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await para.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Clear formatting", exact: true }).click();
    await expect(para.locator("u, s, strike, span")).toHaveCount(0);
    await expect(para.locator("a")).toHaveText("echo");
    await saved(page);
    const cleared = JSON.parse((await (await request.get(`/api/pages/${pageId}`)).json()).content)[0].props.text as string;
    expect(cleared).toBe('Alpha bravo charlie delta <a href="https://example.com">echo</a>');

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
