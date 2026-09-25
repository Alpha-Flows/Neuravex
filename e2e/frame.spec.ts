import { test, expect, type APIRequestContext, type Locator } from "@playwright/test";
import { readFromZip } from "./zip";

/**
 * The frame any block can carry: room inside and around it, a border, a
 * shadow and a fill. The canvas and the published page draw it through the
 * same function, and these check that they really do agree — and that the
 * downloaded copy, which has only the markup to go on, agrees as well.
 */

const framed = {
  id: "q",
  type: "quote",
  props: { text: "Framed words", author: "", role: "", align: "left" },
  box: { paddingY: 24, paddingX: 16, marginTop: 40, borderWidth: 2, borderColor: "#0ea5e9", radius: 12, shadow: "md", background: "#fef3c7" },
};

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (await request.post("/api/sites", { data: { name: `Frame ${Date.now()}${Math.random()}` } })).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  const res = await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  expect(res.ok()).toBe(true);
  return { site, pageId: pages[0].id as string };
}

/** The styles that make up the frame, as the browser worked them out. */
const frameOf = (el: Locator) =>
  el.evaluate((node) => {
    const s = getComputedStyle(node);
    return {
      paddingTop: s.paddingTop,
      paddingLeft: s.paddingLeft,
      marginTop: s.marginTop,
      borderTopWidth: s.borderTopWidth,
      borderTopColor: s.borderTopColor,
      borderRadius: s.borderTopLeftRadius,
      background: s.backgroundColor,
      shadow: s.boxShadow !== "none",
    };
  });

const expected = {
  paddingTop: "24px",
  paddingLeft: "16px",
  marginTop: "40px",
  borderTopWidth: "2px",
  borderTopColor: "rgb(14, 165, 233)",
  borderRadius: "12px",
  background: "rgb(254, 243, 199)",
  shadow: true,
};

test.describe("A block's frame", () => {
  test("is drawn the same on the published page and on the canvas", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, [framed]);

    await page.goto(`/sites/${site.slug}`);
    const published = page.locator(".nvx-block-frame").filter({ hasText: "Framed words" });
    expect(await frameOf(published)).toEqual(expected);

    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await page.waitForSelector(".public-canvas");
    const onCanvas = page.locator(".public-canvas .nvx-block-frame").filter({ hasText: "Framed words" });
    expect(await frameOf(onCanvas)).toEqual(expected);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is set from the inspector, and nothing is left behind when it is cleared", async ({ page, request }) => {
    const { site, pageId } = await siteWith(request, [{ id: "t", type: "text", props: { text: "Plain words" } }]);
    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await page.waitForSelector(".public-canvas");
    const block = page.locator(".public-canvas .editor-block").filter({ hasText: "Plain words" }).first();
    await block.click();

    await page.getByLabel("Top, bottom").fill("32");
    await page.getByRole("button", { name: "Shadow L" }).click();
    const frame = block.locator(".nvx-block-frame");
    await expect.poll(async () => (await frameOf(frame)).paddingTop).toBe("32px");
    expect((await frameOf(frame)).shadow).toBe(true);

    // Cleared, the block is drawn as it was, with no frame element at all.
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(frame).toHaveCount(0);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("goes into the downloaded page as it is drawn", async ({ request }) => {
    const { site } = await siteWith(request, [framed]);
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const html = readFromZip(archive, "index.html") ?? "";
    expect(html).toMatch(/style="[^"]*padding-top:24px[^"]*border-radius:12px/);
    expect(html).toContain("box-shadow:0 4px 12px");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
