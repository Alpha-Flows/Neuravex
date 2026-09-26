import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Working on pages the way a site is actually kept: several blocks at once,
 * the order changed without a mouse, a second editor on the same page, a
 * version kept and gone back to, and one phone number changed everywhere.
 */

const line = (id: string, text: string) => ({ id, type: "text", props: { text, align: "left", size: "base", color: "" } });
const heading = (id: string, words: string) => ({ id, type: "heading", props: { text: words, level: 1, align: "left", color: "", weight: "bold" } });
const button = (id: string, label: string, href: string) => ({
  id,
  type: "button",
  props: { label, href, variant: "primary", size: "md", align: "left", color: "", textColor: "" },
});

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (await request.post("/api/sites", { data: { name: `Work ${Date.now()}${Math.random()}` } })).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  return { site, pageId: pages[0].id as string };
}

async function openEditor(page: Page, siteId: string, pageId: string) {
  await page.goto(`/admin/sites/${siteId}/pages/${pageId}`);
  await page.waitForSelector(".public-canvas");
  await page.waitForTimeout(700);
}

const stored = async (request: APIRequestContext, pageId: string) => JSON.parse((await (await request.get(`/api/pages/${pageId}`)).json()).content);
const ids = (blocks: { id: string }[]) => blocks.map((b) => b.id);
const status = (page: Page) => page.locator("header span.text-xs").first();
const block = (page: Page, id: string) => page.locator(`.public-canvas [data-block-id="${id}"]`);
const lines = () => [line("t1", "Line one"), line("t2", "Line two"), line("t3", "Line three"), line("t4", "Line four")];

test.describe("Several blocks at once", () => {
  test("go into a section together, and are deleted together", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, lines());
    await openEditor(page, site.id, pageId);

    // The first is chosen by clicking into its text, which is how most
    // choices begin; the second is added with Shift held.
    await block(page, "t2").click();
    await block(page, "t3").click({ modifiers: ["Shift"] });
    const panel = page.locator("[data-selection-panel]");
    await expect(panel).toContainText("2 blocks chosen");
    await panel.getByRole("button", { name: "Put them in a section" }).click();
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });

    let content = await stored(request, pageId);
    expect(content).toHaveLength(3);
    expect(content[0].id).toBe("t1");
    expect(content[1].type).toBe("section");
    expect(ids(content[1].children)).toEqual(["t2", "t3"]);
    expect(content[2].id).toBe("t4");

    await block(page, "t1").click();
    await block(page, "t4").click({ modifiers: ["ControlOrMeta"] });
    await expect(panel).toContainText("2 blocks chosen");
    await panel.getByRole("button", { name: "Delete 2 blocks" }).click();
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });

    content = await stored(request, pageId);
    expect(content).toHaveLength(1);
    expect(ids(content[0].children)).toEqual(["t2", "t3"]);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("move to another section together, in page order", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, [...lines(), { id: "box", type: "section", props: {} }]);
    await openEditor(page, site.id, pageId);

    await block(page, "t3").click();
    await block(page, "t1").click({ modifiers: ["Shift"] });
    const panel = page.locator("[data-selection-panel]");
    await panel.getByLabel("Move them to").selectOption("section-box");
    await panel.getByRole("button", { name: "Move", exact: true }).click();
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });

    let content = await stored(request, pageId);
    expect(ids(content)).toEqual(["t2", "t4", "box"]);
    expect(ids(content[2].children)).toEqual(["t1", "t3"]);

    // Adding a block leaves no caret in text and no words selected, so
    // Delete takes out the blocks rather than editing the first of them.
    await block(page, "t2").click();
    await block(page, "t4").click({ modifiers: ["Shift"] });
    await expect(panel).toContainText("2 blocks chosen");
    expect(await page.evaluate(() => String(window.getSelection() ?? ""))).toBe("");
    await page.keyboard.press("Delete");
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });
    content = await stored(request, pageId);
    expect(ids(content)).toEqual(["box"]);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The order without a mouse", () => {
  test("moves a block with its up and down buttons, and with Alt and an arrow", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, lines().slice(0, 3));
    await openEditor(page, site.id, pageId);

    await block(page, "t1").click();
    await block(page, "t1").getByRole("button", { name: "Move down", exact: true }).first().click();
    await expect(page.locator(".public-canvas .editor-block").first()).toHaveAttribute("data-block-id", "t2");
    // At the top of the page now there is nowhere further up to go.
    await block(page, "t2").click();
    await expect(block(page, "t2").getByRole("button", { name: "Move up", exact: true }).first()).toBeDisabled();

    // Chosen from the outline, as a keyboard reaches a block, then moved with Alt.
    await page.getByRole("button", { name: "outline" }).click();
    await page.getByRole("treeitem", { name: /Line two/ }).click();
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Control+s");
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });

    expect(ids(await stored(request, pageId))).toEqual(["t1", "t3", "t2"]);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Two editors on one page", () => {
  /** The page opened here, then written from somewhere else, then changed here. */
  async function collide(page: Page, request: APIRequestContext) {
    const { site, pageId } = await siteWith(request, lines().slice(0, 2));
    await openEditor(page, site.id, pageId);
    await request.put(`/api/pages/${pageId}/save`, { data: { content: [line("t1", "Written elsewhere"), line("t2", "Line two")] } });
    await block(page, "t1").click();
    await block(page, "t1").getByRole("button", { name: "Move down", exact: true }).first().click();
    await expect(page.locator("[data-conflict]")).toBeVisible({ timeout: 10000 });
    await expect(status(page)).toContainText("Not saved — changed elsewhere");
    return { site, pageId };
  }

  test("are told, and keeping mine keeps theirs in the history", async ({ page, request }) => {
    const { site, pageId } = await collide(page, request);
    // Nothing was written over while the question was open.
    expect((await stored(request, pageId))[0].props.text).toBe("Written elsewhere");

    await page.locator("[data-conflict]").getByRole("button", { name: "Keep mine" }).click();
    await expect(page.locator("[data-conflict]")).toHaveCount(0);
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });

    const content = await stored(request, pageId);
    expect(ids(content)).toEqual(["t2", "t1"]);
    expect(content[1].props.text).toBe("Line one");
    const revisions = await (await request.get(`/api/pages/${pageId}/revisions`)).json();
    const theirs = revisions.find((r: { name: string | null }) => r.name === "Changed elsewhere, before it was written over");
    expect(theirs?.content).toContain("Written elsewhere");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("can take the newer version, with theirs set aside", async ({ page, request }) => {
    const { site, pageId } = await collide(page, request);
    // The work is in the history by the time the page is loaded again, so
    // the unsaved-changes guard has nothing to ask.
    const prompts: string[] = [];
    page.on("dialog", (d) => {
      prompts.push(d.type());
      void d.accept();
    });

    await page.locator("[data-conflict]").getByRole("button", { name: "Load the newer version" }).click();
    await expect(page.locator(".public-canvas").getByText("Written elsewhere")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("[data-conflict]")).toHaveCount(0);

    const revisions = await (await request.get(`/api/pages/${pageId}/revisions`)).json();
    const mine = revisions.find((r: { name: string | null }) => r.name === "Your changes, set aside for a newer version");
    expect(ids(JSON.parse(mine.content))).toEqual(["t2", "t1"]);
    expect(ids(await stored(request, pageId))).toEqual(["t1", "t2"]);
    expect(prompts).toEqual([]);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("an agent's save is refused when it is behind", async ({ request }) => {
    const { site, pageId } = await siteWith(request, lines().slice(0, 1));
    const { version } = await (await request.get(`/api/pages/${pageId}?version=1`)).json();
    await request.put(`/api/pages/${pageId}/save`, { data: { content: [line("t1", "Newer")] } });
    const late = await request.put(`/api/pages/${pageId}/save`, { data: { content: [line("t1", "Older")], baseVersion: version } });
    expect(late.status()).toBe(409);
    expect((await late.json()).conflict).toBe(true);
    expect((await stored(request, pageId))[0].props.text).toBe("Newer");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Versions", () => {
  test("are kept by name, say what changed since, and a restore can be undone", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, lines().slice(0, 2));
    await openEditor(page, site.id, pageId);

    const versions = page.locator("[data-revisions]");
    await versions.getByLabel("Name for this version").fill("Before the reshuffle");
    await versions.getByRole("button", { name: "Keep version" }).click();
    await expect(versions.getByRole("status")).toContainText("Kept as “Before the reshuffle”.");
    await expect(versions.locator('[data-revision="Before the reshuffle"]')).toBeVisible();

    // Restored straight after a change that may not have been saved yet: it
    // is saved first, so it is in the version the undo goes back to, and
    // leaving for the restored page asks nothing.
    const prompts: string[] = [];
    page.on("dialog", (d) => {
      prompts.push(d.type());
      void d.accept();
    });
    await block(page, "t1").click();
    await block(page, "t1").getByRole("button", { name: "Move down", exact: true }).first().click();
    await page.keyboard.press("Escape");

    await versions.locator('[data-revision="Before the reshuffle"]').getByRole("button", { name: "Preview" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: /What changed since \(1\)/ }).click();
    await expect(dialog.locator("[data-changes]")).toContainText("Moved");

    await dialog.getByRole("button", { name: "Restore this version" }).click();
    await expect(page.locator("[data-undo-restore]")).toBeVisible({ timeout: 10000 });
    expect(ids(await stored(request, pageId))).toEqual(["t1", "t2"]);

    await page.locator("[data-undo-restore]").getByRole("button", { name: "Undo the restore" }).click();
    await expect(page.locator("[data-undo-restore]")).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator(".public-canvas .editor-block").first()).toHaveAttribute("data-block-id", "t2");
    expect(ids(await stored(request, pageId))).toEqual(["t2", "t1"]);

    // The named version is still there, however many saves follow it.
    const revisions = await (await request.get(`/api/pages/${pageId}/revisions`)).json();
    expect(revisions.map((r: { name: string | null }) => r.name)).toContain("Before the reshuffle");
    expect(prompts).toEqual([]);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Find and replace", () => {
  test("changes a phone number on every page, in the footer and in the links to it", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, [heading("h", "Call 01234 567890"), button("call", "Call us", "tel:01234567890")]);
    const second = await (await request.post(`/api/sites/${site.id}/pages`, { data: { title: "Visit", slug: "visit" } })).json();
    await request.put(`/api/pages/${second.id}/save`, { data: { published: true, content: [line("v", "Ring 01234 567890 before you come")] } });
    await request.patch(`/api/sites/${site.id}`, { data: { footer: { contact: { phone: "01234 567890" } } } });

    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: "Find and replace" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Find", { exact: true }).fill("01234 567890");
    await dialog.getByRole("button", { name: "Find", exact: true }).click();

    const results = dialog.locator("[data-find-results]");
    await expect(results).toContainText("Found 4 times in 4 places");
    await expect(results.getByRole("region", { name: "On every page" })).toContainText("Footer: phone");
    await expect(results.locator("mark").first()).toHaveText("01234 567890");
    // The button's words do not have the number; its link does.
    await expect(results.locator(`[data-find-result="page:${pageId}:block:call"]`)).toContainText("Links to 01234567890");

    // Left as it is on the Visit page.
    await results.getByRole("checkbox", { name: "Replace in Text on Visit" }).uncheck();
    await dialog.getByLabel("Replace with").fill("07000 111222");
    await dialog.getByRole("button", { name: "Replace 3 times" }).click();
    await expect(dialog.getByRole("status")).toContainText("Replaced 3 times on one page and in the site's menu, footer or settings.");
    // What is left is the one place not chosen.
    await expect(results).toContainText("Found once in one place");

    const home = await stored(request, pageId);
    expect(home[0].props.text).toBe("Call 07000 111222");
    expect(home[1].props.href).toBe("tel:07000111222");
    expect((await stored(request, second.id))[0].props.text).toBe("Ring 01234 567890 before you come");
    const footer = JSON.parse((await (await request.get(`/api/sites/${site.id}`)).json()).footer);
    expect(footer.contact.phone).toBe("07000 111222");

    const revisions = await (await request.get(`/api/pages/${pageId}/revisions`)).json();
    const before = revisions.find((r: { name: string | null }) => r.name === "Before replacing “01234 567890”");
    expect(before?.content).toContain("tel:01234567890");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
