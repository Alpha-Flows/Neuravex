import { test, expect, APIRequestContext, Page } from "@playwright/test";

/**
 * The editor canvas and the preview have to be the same page.
 *
 * Pressing Preview used to hand the canvas the inspector's 18rem and re-pin
 * its width, so the layout you had been editing re-flowed the moment you
 * looked at it: different line breaks, different heights, blocks somewhere
 * else. These tests hold the canvas still.
 */

const text = (id: string, label: string) => ({
  id, type: "text", props: { text: label, align: "left", size: "base", color: "" },
});
const spacer = (id: string) => ({ id, type: "spacer", props: { height: 64 } });
const list = (id: string) => ({
  id, type: "list", props: { style: "bullet", items: ["One", "Two", "Three"] },
});
const html = (id: string) => ({ id, type: "html", props: { html: "<p>embedded</p>" } });

async function siteWith(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Canvas ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { published: true, content } });
  return { site, page: pages[0] };
}

/** The canvas box, and where every block on it starts and ends. */
async function canvasGeometry(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".public-canvas") as HTMLElement;
    const round = (r: DOMRect) => ({
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
    });
    return {
      // The framed panel, and the page inside it (inset by the frame's border).
      frame: round(document.querySelector("[data-canvas-frame]")!.getBoundingClientRect()),
      canvas: round(canvas.getBoundingClientRect()),
      main: round(canvas.querySelector("main")!.getBoundingClientRect()),
    };
  });
}

async function openEditor(page: Page, siteId: string, pageId: string) {
  await page.goto(`/admin/sites/${siteId}/pages/${pageId}`);
  await page.waitForSelector(".public-canvas");
  await page.waitForTimeout(600);
}

test.describe("Pressing Preview", () => {
  test("does not move or resize the page", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [
      text("a", "A line long enough that a change of width would re-wrap it somewhere different."),
      spacer("b"),
      list("c"),
      html("d"),
    ]);
    await page.setViewportSize({ width: 1600, height: 900 });
    await openEditor(page, site.id, p.id);

    const editing = await canvasGeometry(page);
    // Scoped to the toolbar: the revisions panel has a Preview of its own.
    await page.getByRole("banner").getByRole("button", { name: "Preview", exact: true }).click();
    await page.waitForTimeout(400);
    const previewing = await canvasGeometry(page);

    // Same box, same content height: nothing re-flowed.
    expect(previewing.frame).toEqual(editing.frame);
    expect(previewing.canvas).toEqual(editing.canvas);
    expect(previewing.main).toEqual(editing.main);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("keeps the width the toolbar was set to", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [text("a", "on the page")]);
    await page.setViewportSize({ width: 1600, height: 900 });
    await openEditor(page, site.id, p.id);

    // The width buttons live in the toolbar now, so they work while editing.
    await page.getByRole("button", { name: "768", exact: true }).click();
    await page.waitForTimeout(300);
    const editing = await canvasGeometry(page);
    expect(editing.frame.w).toBe(768);

    // Scoped to the toolbar: the revisions panel has a Preview of its own.
    await page.getByRole("banner").getByRole("button", { name: "Preview", exact: true }).click();
    await page.waitForTimeout(400);
    expect((await canvasGeometry(page)).frame.w).toBe(768);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Editing controls", () => {
  test("take no room the published page does not have", async ({ page, request }) => {
    const content = [text("a", "before"), list("c"), html("d"), spacer("b"), text("z", "after")];
    const { site, page: p } = await siteWith(request, content);
    await page.setViewportSize({ width: 1600, height: 900 });

    await openEditor(page, site.id, p.id);
    const canvas = await canvasGeometry(page);

    await page.goto(`/sites/${site.slug}`);
    await page.waitForSelector("main");
    const published = await page.evaluate(() =>
      Math.round(document.querySelector("main")!.getBoundingClientRect().height),
    );

    // The canvas is a narrower panel, so the two are not identical — but the
    // canvas must not be *taller*, which is what a dashed frame round every
    // HTML block and an "Add item" under every list used to make it.
    expect(canvas.main.h).toBeLessThanOrEqual(published);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("ring the block they belong to", async ({ page, request }) => {
    const { site, page: p } = await siteWith(request, [text("a", "pick me")]);
    await page.setViewportSize({ width: 1600, height: 900 });
    await openEditor(page, site.id, p.id);

    const ring = await page.evaluate(() => {
      const outline = document.querySelector(".editor-outline") as HTMLElement;
      const block = outline.parentElement as HTMLElement;
      const a = outline.getBoundingClientRect();
      const b = block.getBoundingClientRect();
      return { outline: Math.round(a.height), block: Math.round(b.height) };
    });

    // It used to be an empty element 0px tall, so hovering a block drew a
    // dashed line across its top edge instead of a box round it.
    expect(ring.outline).toBe(ring.block);
    expect(ring.outline).toBeGreaterThan(0);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
