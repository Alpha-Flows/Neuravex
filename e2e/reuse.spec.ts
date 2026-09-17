import { test, expect, APIRequestContext, Page } from "@playwright/test";

const heading = (id: string, text: string) => ({
  id, type: "heading", props: { text, level: 2, align: "left", color: "", weight: "bold" },
});

async function siteWithTwoPages(request: APIRequestContext) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Reuse ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, {
    data: {
      title: "Home",
      content: [
        {
          id: "sec", type: "section",
          props: { background: "#f8fafc", paddingY: 48, paddingX: 24, maxWidth: "6xl", align: "center" },
          children: [heading("inner", "Inside the section")],
        },
      ],
    },
  });
  const second = await (
    await request.post(`/api/sites/${site.id}/pages`, { data: { title: "Second", slug: "second" } })
  ).json();
  await request.put(`/api/pages/${second.id}/save`, { data: { content: [heading("only", "Second page")] } });
  return { site, home: pages[0], second };
}

const status = (page: Page) => page.locator("header span.text-xs").first();

test.describe("Copying a block", () => {
  test("carries it to another page, with ids of its own", async ({ page, request }) => {
    const { site, home, second } = await siteWithTwoPages(request);

    await page.goto(`/admin/sites/${site.id}/pages/${home.id}`);
    // Pick the section itself from the outline — clicking the canvas would
    // land on the heading inside it.
    await page.getByRole("button", { name: "outline" }).click();
    await page.getByRole("treeitem", { name: /Section/ }).click();
    await page.keyboard.press("Control+c");

    await page.goto(`/admin/sites/${site.id}/pages/${second.id}`);
    await expect(page.getByRole("button", { name: /Paste section/i })).toBeVisible();
    await page.keyboard.press("Control+v");

    await expect(page.locator(".public-canvas").getByText("Inside the section")).toBeVisible();
    await expect(status(page)).toContainText("Saved", { timeout: 10000 });

    const saved = await (await request.get(`/api/pages/${second.id}`)).json();
    expect(saved.content).toContain("Inside the section");
    // The copy is its own block, not a second claim on the original's id.
    expect(saved.content).not.toContain('"sec"');
    expect(saved.content).not.toContain('"inner"');
    // And the page it came from is untouched.
    const origin = await (await request.get(`/api/pages/${home.id}`)).json();
    expect(origin.content).toContain('"sec"');

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("cut takes it away, and paste puts it back", async ({ page, request }) => {
    const { site, home } = await siteWithTwoPages(request);
    await page.goto(`/admin/sites/${site.id}/pages/${home.id}`);

    await page.getByRole("button", { name: "outline" }).click();
    await page.getByRole("treeitem", { name: /Section/ }).click();
    await page.keyboard.press("Control+x");
    await expect(page.locator(".public-canvas").getByText("Inside the section")).toHaveCount(0);

    await page.keyboard.press("Control+v");
    await expect(page.locator(".public-canvas").getByText("Inside the section")).toBeVisible();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("leaves text alone while you are typing in it", async ({ page, request }) => {
    const { site, home } = await siteWithTwoPages(request);
    await page.goto(`/admin/sites/${site.id}/pages/${home.id}`);

    const text = page.locator(".inline-editable").first();
    await text.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    // The browser's own copy took the text; the block was not put on our
    // clipboard, so there is nothing to paste as a block.
    await expect(page.getByRole("button", { name: /^Paste/ })).toHaveCount(0);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The outline", () => {
  test("selects a container that is hard to click on the canvas", async ({ page, request }) => {
    const { site, home } = await siteWithTwoPages(request);
    await page.goto(`/admin/sites/${site.id}/pages/${home.id}`);

    await page.getByRole("button", { name: "outline" }).click();
    await page.getByRole("treeitem", { name: /Section/ }).click();

    // The inspector opens on the Section, not on the heading inside it.
    await expect(page.getByText("Editing", { exact: true })).toBeVisible();
    await expect(page.locator("aside").last()).toContainText("section");

    // Both blocks are listed, the child indented under its parent.
    await expect(page.getByRole("treeitem", { name: /Heading/ })).toBeVisible();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Saving a block for reuse", () => {
  test("offers it on another page, and puts it in with ids of its own", async ({ page, request }) => {
    const { site, home, second } = await siteWithTwoPages(request);

    await page.goto(`/admin/sites/${site.id}/pages/${home.id}`);
    await page.getByRole("button", { name: "outline" }).click();
    await page.getByRole("treeitem", { name: /Section/ }).click();

    await page.getByRole("button", { name: "Save for reuse" }).click();
    const name = `Hero ${Date.now()}`;
    await page.getByPlaceholder("Pricing section").fill(name);
    // Scoped to the inspector: the editor's own Save button matches too.
    await page.locator("aside").last().getByRole("button", { name: "Save", exact: true }).click();

    // It is offered straight away, without a reload.
    await page.getByRole("button", { name: "blocks" }).click();
    await expect(page.getByRole("button", { name: `Insert ${name}` })).toBeVisible();

    // And on a different page of the site.
    await page.goto(`/admin/sites/${site.id}/pages/${second.id}`);
    await page.getByRole("button", { name: `Insert ${name}` }).click();
    await expect(page.locator(".public-canvas").getByText("Inside the section")).toBeVisible();

    await expect(status(page)).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${second.id}`)).json();
    expect(saved.content).toContain("Inside the section");
    expect(saved.content).not.toContain('"sec"');

    // Tidy up the library entry this test made.
    const rows = await (await request.get("/api/saved-blocks")).json();
    const mine = rows.find((r: { name: string }) => r.name === name);
    await request.delete(`/api/saved-blocks/${mine.id}`);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("refuses a nameless or nonsense entry", async ({ request }) => {
    const noName = await request.post("/api/saved-blocks", { data: { name: "  ", block: { id: "a", type: "text" } } });
    expect(noName.status()).toBe(400);

    const noBlock = await request.post("/api/saved-blocks", { data: { name: "Thing", block: { nope: true } } });
    expect(noBlock.status()).toBe(400);
  });
});
