import { test, expect, Page, APIRequestContext } from "@playwright/test";

/** A site with one page holding the given blocks, opened in the editor. */
async function seed(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Editing ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { title: "Home", content } });
  return { site, page: pages[0] };
}

function heading(text: string) {
  return { id: "h1", type: "heading", props: { text, level: 1, align: "left", color: "#0f172a", weight: "bold" } };
}

function paragraph(id: string, text: string) {
  return { id, type: "text", props: { text, align: "left", size: "base", color: "#334155" } };
}

const status = (page: Page) => page.locator("header span.text-xs").first();

test.describe("Editing text in a block", () => {
  test("backspace edits the text instead of deleting the block", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [heading("Hello")]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const text = page.locator(".inline-editable").first();
    await text.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");

    // The block is still there, one character shorter.
    await expect(page.locator(".editor-block")).toHaveCount(1);
    await expect(text).toHaveText("Hell");

    await request.delete(`/api/sites/${site.id}`);
  });

  test("text typed but not blurred still reaches the server", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [heading("Hello")]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    await page.locator(".inline-editable").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" World");
    // Stay in the text: no click elsewhere, no blur.
    await page.keyboard.press("Control+s");
    await expect(status(page)).toContainText("Saved");

    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.content).toContain("Hello World");

    await request.delete(`/api/sites/${site.id}`);
  });

  test("a run of keystrokes is one undo step, and undo puts the text back", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [heading("Hello")]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const text = page.locator(".inline-editable").first();
    await text.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" World");
    await page.waitForTimeout(900); // close the coalescing window

    await page.getByTitle("Undo (Cmd+Z)").click();
    await expect(text).toHaveText("Hello");

    await request.delete(`/api/sites/${site.id}`);
  });
});

test.describe("The formatting toolbar", () => {
  test("only the block being edited shows one, and bold sticks", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [
      paragraph("t1", "Alpha bravo charlie"),
      paragraph("t2", "Second paragraph"),
      paragraph("t3", "Third paragraph"),
    ]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const para = page.locator(".inline-editable").first();
    await para.click();
    await page.keyboard.press("Home");
    await page.keyboard.down("Shift");
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");

    // One toolbar, not one per text block on the page.
    const toolbar = page.locator("div.fixed.z-50");
    await expect(toolbar).toHaveCount(1);

    await toolbar.getByTitle("Bold (Ctrl+B)").click();
    await expect(para.locator("b")).toHaveText("Alpha");

    await expect(status(page)).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.content).toContain("<b>Alpha</b>");

    await request.delete(`/api/sites/${site.id}`);
  });
});

test.describe("The page address", () => {
  test("a slug typed in the editor is saved, tidied and used by the live link", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [heading("Hi")]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    await page.getByLabel("Page URL").fill("About Us");
    await page.getByLabel("Page URL").blur();
    await expect(page.getByLabel("Page URL")).toHaveValue("about-us");
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });

    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.slug).toBe("about-us");

    await request.delete(`/api/sites/${site.id}`);
  });

  test("a slug another page already owns gets a suffix, and the editor shows it", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [heading("Hi")]);
    await request.post(`/api/sites/${site.id}/pages`, { data: { title: "About", slug: "about" } });

    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);
    await page.getByLabel("Page URL").fill("about");
    await page.getByLabel("Page URL").blur();
    await expect(page.getByLabel("Page URL")).toHaveValue("about-1", { timeout: 10000 });

    await request.delete(`/api/sites/${site.id}`);
  });
});

test.describe("Publishing", () => {
  test("publishes the page as it stands, not the last autosave", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [heading("Old headline")]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    await page.locator(".inline-editable").first().click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Brand new headline");
    // Publish immediately, well inside the autosave delay.
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();

    const live = await request.get(`/sites/${site.slug}`);
    expect(await live.text()).toContain("Brand new headline");

    await request.delete(`/api/sites/${site.id}`);
  });
});

test.describe("A fixed header", () => {
  test("leaves room for the page instead of covering it", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [heading("Top heading")]);
    await request.put(`/api/pages/${p.id}/save`, { data: { published: true } });
    await request.patch(`/api/sites/${site.id}`, { data: { headerPosition: "fixed" } });

    await page.goto(`/sites/${site.slug}`);
    const header = await page.locator("header").boundingBox();
    const h1 = await page.locator("h1").boundingBox();
    expect(header).not.toBeNull();
    expect(h1).not.toBeNull();
    expect(h1!.y).toBeGreaterThanOrEqual(header!.y + header!.height);

    await request.delete(`/api/sites/${site.id}`);
  });
});
