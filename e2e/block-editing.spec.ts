import { test, expect, APIRequestContext } from "@playwright/test";

async function seed(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Blocks ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { title: "Home", content } });
  return { site, page: pages[0] };
}

const button = {
  id: "b1",
  type: "button",
  props: { label: "Get started", href: "#", variant: "primary", size: "md", align: "left", color: "#6366f1", textColor: "#ffffff" },
};
const image = { id: "i1", type: "image", props: { src: "", alt: "", rounded: "xl", width: "large", caption: "" } };
const html = { id: "c1", type: "html", props: { html: "<p>one</p>" } };
const text = { id: "t1", type: "text", props: { text: "Alpha bravo charlie", align: "left", size: "base", color: "#334155" } };

test.describe("Setting a button's link", () => {
  test("saves what was typed, and leaves it alone when cancelled", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [button]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    // Selecting the block brings up the controls that belong to the editor.
    await page.locator(".editor-block").first().click();
    await page.getByRole("button", { name: "# ↗" }).click();
    const field = page.getByRole("textbox", { name: "Link URL" });
    await expect(field).toBeFocused();
    await field.fill("https://example.com/pricing");
    await page.keyboard.press("Escape");
    // Escape means escape: the old link stands.
    await expect(page.getByRole("button", { name: "# ↗" })).toBeVisible();

    await page.getByRole("button", { name: "# ↗" }).click();
    await page.getByRole("textbox", { name: "Link URL" }).fill("https://example.com/pricing");
    await page.locator(".editor-block").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "https://example.com/pricing ↗" })).toBeVisible();

    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.content).toContain("https://example.com/pricing");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Pointing an image at a URL", () => {
  test("takes the address without blocking the page", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [image]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    // An image with no source shows a placeholder that is part of the page,
    // not a request to some other website.
    const img = page.locator("figure img");
    await expect(img).toHaveAttribute("src", /^data:image\/svg\+xml/);

    await page.locator(".editor-block").first().click();
    await page.getByRole("button", { name: "Use URL" }).click();
    await page.getByRole("textbox", { name: "Image URL" }).fill("https://example.com/photo.jpg");
    await page.keyboard.press("Enter");
    await expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Editing custom HTML", () => {
  test("opens an editor that holds more than one line", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [html]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    // "Edit HTML" is editor chrome now: it floats over the block and appears
    // when the block is hovered or selected, rather than taking a line under
    // the markup and pushing the rest of the page down.
    await page.locator(".editor-block").first().click();
    await page.getByRole("button", { name: "Edit HTML" }).click();
    const box = page.getByRole("dialog", { name: "Custom HTML" }).locator("textarea");
    await box.fill("<p>one</p>\n<p>two</p>");
    await page.getByRole("dialog", { name: "Custom HTML" }).getByRole("button", { name: "Save" }).click();

    await expect(page.locator(".editor-block p")).toHaveCount(2);
    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.content).toContain("<p>two</p>");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Linking selected text", () => {
  test("wraps the selection that was there when the button was pressed", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [text]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const para = page.locator(".inline-editable").first();
    await para.click();
    await page.keyboard.press("Home");
    await page.keyboard.down("Shift");
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");

    // Exact: the palette describes three blocks as links too.
    await page.getByTitle("Link", { exact: true }).click();
    await page.getByRole("textbox", { name: "Link URL" }).fill("https://example.com");
    await page.getByRole("button", { name: "Link", exact: true }).click();

    await expect(para.locator("a")).toHaveAttribute("href", "https://example.com");
    await expect(para.locator("a")).toHaveText("Alpha");

    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.content).toContain("https://example.com");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A video block with nothing in it", () => {
  test("asks for a video in the editor and stays out of the published page", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [
      { id: "v1", type: "video", props: { src: "", poster: "", ratio: "16/9" } },
      { id: "h1", type: "heading", props: { text: "Below", level: 2, align: "left", color: "#0f172a", weight: "bold" } },
    ]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);
    await expect(page.getByText("No video yet")).toBeVisible();

    await request.put(`/api/pages/${p.id}/save`, { data: { published: true } });
    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.getByText("No video yet")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Below" })).toBeVisible();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
