import { test, expect, APIRequestContext } from "@playwright/test";

async function seed(request: APIRequestContext, content: unknown[]) {
  const site = await (
    await request.post("/api/sites", { data: { name: `Columns ${Date.now()}${Math.random()}` } })
  ).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  await request.put(`/api/pages/${pages[0].id}/save`, { data: { title: "Home", content } });
  return { site, page: pages[0] };
}

const text = (id: string, body: string, column: number) => ({
  id,
  type: "text",
  column,
  props: { text: body, align: "left", size: "base", color: "#334155" },
});

function columns(columnStyles?: unknown[]) {
  return {
    id: "cols",
    type: "columns",
    props: { count: 2, gap: 24, ...(columnStyles ? { columnStyles } : {}) },
    children: [text("t1", "Left column", 0), text("t2", "Right column", 1)],
  };
}

test.describe("A column with a backdrop of its own", () => {
  test("renders the image, its overlay and its inset on that column only", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [
      columns([{}, { backgroundImage: "/media/hero.jpg", backgroundOverlay: "rgba(0,0,0,0.45)", padding: 32, radius: 16 }]),
    ]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    const cells = page.locator(".nvx-columns-grid > div");
    await expect(cells).toHaveCount(2);

    const styled = await cells.nth(1).evaluate((el) => {
      const s = getComputedStyle(el);
      return { image: s.backgroundImage, padding: s.paddingTop, radius: s.borderTopLeftRadius };
    });
    expect(styled.image).toContain("/media/hero.jpg");
    expect(styled.image).toContain("linear-gradient");
    expect(styled.padding).toBe("32px");
    expect(styled.radius).toBe("16px");

    // The column next to it is untouched — this is a column backdrop, not the
    // row's.
    const plain = await cells.nth(0).evaluate((el) => {
      const s = getComputedStyle(el);
      return { image: s.backgroundImage, padding: s.paddingTop };
    });
    expect(plain.image).toBe("none");
    expect(plain.padding).toBe("0px");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("the inspector gives one column a colour and saves it", async ({ page, request }) => {
    const { site, page: p } = await seed(request, [columns()]);
    await page.goto(`/admin/sites/${site.id}/pages/${p.id}`);

    // The outline is how you reach a container that is covered by its own
    // children on the canvas.
    await page.getByRole("button", { name: "outline", exact: true }).click();
    await page.getByRole("treeitem", { name: /Columns/ }).click();
    const inspector = page.locator("aside").last();
    await expect(inspector.getByText("Column backdrop")).toBeVisible();

    // Column two, then a colour for it.
    await inspector.getByRole("button", { name: "Column 2", exact: true }).click();
    // By its placeholder: the Frame panel below has a colour field as well.
    await inspector.getByPlaceholder("No background").fill("#123456");

    const cells = page.locator(".nvx-columns-grid > div");
    await expect(cells.nth(1)).toHaveCSS("background-color", "rgb(18, 52, 86)");
    // A backdrop with no inset would put the words on its edge, so the first
    // one brings a default padding with it.
    await expect(cells.nth(1)).toHaveCSS("padding-top", "24px");
    await expect(cells.nth(0)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });
    const saved = await (await request.get(`/api/pages/${p.id}`)).json();
    expect(saved.content).toContain("columnStyles");
    expect(saved.content).toContain("#123456");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
