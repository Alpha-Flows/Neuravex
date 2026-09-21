import { test, expect, APIRequestContext, Page } from "@playwright/test";
import { inflateRawSync } from "zlib";

/**
 * Depth: blocks that sit over each other instead of pushing each other apart.
 *
 * The page was one flat stack, so a text block dropped onto a picture pushed
 * the picture down and the picture pushed the text back. These cover the three
 * places that has to hold: the canvas, the published page, and the file the
 * customer downloads.
 */

const image = {
  id: "i1",
  type: "image",
  props: {
    src: "/stock/nature/pietro-de-grandi-Q5dMq3cKqec-unsplash.jpg",
    alt: "A lake below mountains",
    rounded: "xl",
    width: "full",
    caption: "",
  },
};

const heading = (layer?: unknown) => ({
  id: "h1",
  type: "heading",
  props: { text: "Words on the photograph", level: 1, align: "left", color: "#ffffff", weight: "bold" },
  ...(layer ? { layer } : {}),
});

const section = (children: unknown[]) => ({
  id: "s1",
  type: "section",
  props: { background: "#0f172a", paddingY: 40, paddingX: 24, maxWidth: "site", align: "center" },
  children,
});

async function seed(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Depth ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, {
    data: { title: "Home", slug: pages[0].slug, isHome: true, published: true, content },
  });
  return { site, page: pages[0] };
}

/** Two blocks overlap when the box of one crosses the box of the other. */
async function overlaps(page: Page, a: string, b: string): Promise<boolean> {
  const one = await page.locator(a).first().boundingBox();
  const two = await page.locator(b).first().boundingBox();
  if (!one || !two) return false;
  return (
    one.x < two.x + two.width &&
    two.x < one.x + one.width &&
    one.y < two.y + two.height &&
    two.y < one.y + one.height
  );
}

test.describe("A heading laid over a photograph", () => {
  test("overlaps it on the published page, and does not move it", async ({ page, request }) => {
    const float = { mode: "float", level: 2, x: 8, y: 30, width: 55 };
    const { site } = await seed(request, [section([image, heading(float)])]);

    await page.goto(`/sites/${site.slug}`);
    const picture = page.locator("figure img");
    await expect(picture).toBeVisible();
    await expect(page.getByRole("heading", { name: "Words on the photograph" })).toBeVisible();
    expect(await overlaps(page, "figure img", "h1")).toBe(true);

    // The picture keeps the top of the section: a floating block takes no room
    // of its own, so nothing it covers is pushed anywhere.
    const before = await picture.boundingBox();
    expect(before!.y).toBeLessThan((await page.locator("h1").first().boundingBox())!.y);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is stacked below the photograph when it is sent behind it", async ({ page, request }) => {
    // Same two blocks, the heading behind rather than in front. It is still in
    // the same place; the picture is simply drawn over it.
    const behind = { mode: "float", level: -1, x: 8, y: 30, width: 55 };
    const { site } = await seed(request, [section([image, heading(behind)])]);
    await page.goto(`/sites/${site.slug}`);

    const covered = await page.evaluate(() => {
      const h = document.querySelector("h1")!;
      const box = h.getBoundingClientRect();
      const onTop = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return onTop?.tagName ?? "";
    });
    expect(covered).toBe("IMG");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("still stacks the ordinary way when nothing floats", async ({ page, request }) => {
    // The guarantee for every page written before depth existed.
    const { site } = await seed(request, [section([image, heading()])]);
    await page.goto(`/sites/${site.slug}`);
    expect(await overlaps(page, "figure img", "h1")).toBe(false);
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Setting a block's depth in the editor", () => {
  test("lifts it out of the flow, and the canvas shows what the page will do", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [section([image, heading()])]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    // Nothing overlaps to begin with.
    expect(await overlaps(page, ".public-canvas figure img", ".public-canvas h1")).toBe(false);

    await page.locator(".editor-block").filter({ hasText: "Words on the photograph" }).last().click();
    await page.getByRole("button", { name: "Floating" }).click();
    await expect(page.locator(".nvx-layer")).toHaveCount(1);
    expect(await overlaps(page, ".public-canvas figure img", ".public-canvas h1")).toBe(true);

    // Preview draws the same page, from the same placement.
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.locator(".editor-toolbar")).toHaveCount(0);
    expect(await overlaps(page, ".public-canvas figure img", ".public-canvas h1")).toBe(true);
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    const stored = JSON.parse(saved.content)[0].children.find((b: { type: string }) => b.type === "heading");
    expect(stored.layer).toMatchObject({ mode: "float" });

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("moves a float with the handle and sizes it with the grip", async ({ page, request }) => {
    const float = { mode: "float", level: 2, x: 8, y: 30, width: 40 };
    const { site, page: p } = await seed(request, [section([image, heading(float)])]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const block = page.locator(".nvx-layer .editor-block").first();
    await block.click();
    const before = (await block.boundingBox())!;

    const handle = page.getByRole("button", { name: "Move block" }).first();
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 120, hb.y + 40, { steps: 10 });
    await page.mouse.up();

    const moved = (await block.boundingBox())!;
    expect(moved.x).toBeGreaterThan(before.x + 50);
    expect(moved.y).toBeGreaterThan(before.y + 10);

    const grip = page.getByRole("button", { name: "Resize block" }).first();
    const gb = (await grip.boundingBox())!;
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + 140, gb.y, { steps: 10 });
    await page.mouse.up();
    expect((await block.boundingBox())!.width).toBeGreaterThan(moved.width + 50);

    // One drag is one undo press, not one per frame.
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    const back = (await block.boundingBox())!;
    expect(Math.round(back.x)).toBe(Math.round(before.x));
    expect(Math.round(back.width)).toBe(Math.round(before.width));

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

/** One file out of a zip, read the way an unzip tool reads it. */
function readFromZip(zip: Buffer, wanted: string): string | null {
  const end = zip.length - 22;
  const count = zip.readUInt16LE(end + 10);
  let pointer = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(pointer + 10);
    const compressedSize = zip.readUInt32LE(pointer + 20);
    const nameLength = zip.readUInt16LE(pointer + 28);
    const localOffset = zip.readUInt32LE(pointer + 42);
    const path = zip.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    if (path === wanted) {
      const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const body = zip.subarray(start, start + compressedSize);
      return (method === 8 ? inflateRawSync(body) : Buffer.from(body)).toString("utf8");
    }
    pointer += 46 + nameLength;
  }
  return null;
}

test.describe("A downloaded site", () => {
  test("keeps the blocks laid over each other", async ({ request }) => {
    const float = { mode: "float", level: 2, x: 8, y: 30, width: 55 };
    const { site } = await seed(request, [section([image, heading(float)])]);

    const res = await request.get(`/api/sites/${site.id}/download`);
    expect(res.ok()).toBeTruthy();
    const archive = Buffer.from(await res.body());

    // The placement rides in the page's own markup — a downloaded site is
    // plain HTML and CSS, so this is the whole of what keeps the layout.
    const html = readFromZip(archive, "index.html");
    expect(html).toContain("nvx-layer");
    expect(html).toContain("top:30%");
    expect(html).toContain("nvx-block-stack");

    // And the class the stacking context comes from is in the stylesheet
    // beside it, rather than only in the builder.
    const css = readFromZip(archive, "assets/site.css");
    expect(css).toContain(".nvx-block-stack");
    expect(css).toContain("isolation");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
