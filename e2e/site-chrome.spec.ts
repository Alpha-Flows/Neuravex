import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readBytesFromZip, readFromZip } from "./zip";

/**
 * The header's logo and menu, the laid-out footer, links to a named section
 * and a block's scroll-in motion — each set in the builder and checked where
 * a visitor meets it: the published page, and the download.
 */

const LOGO = "/stock/abstract/magicpattern-87PP9Zd7MNo-unsplash.jpg";
const text = (id: string, words: string) => ({ id, type: "text", props: { text: words, align: "left", size: "base", color: "" } });

/** A site with a published home page and the named pages beside it, all published. */
async function siteWith(request: APIRequestContext, content: unknown[], others: string[] = []) {
  const site = await (await request.post("/api/sites", { data: { name: `Chrome ${Date.now()}${Math.random()}` } })).json();
  const home = (await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json())[0];
  expect((await request.put(`/api/pages/${home.id}/save`, { data: { published: true, content } })).ok()).toBe(true);
  const made: Record<string, { id: string; slug: string }> = {};
  for (const title of others) {
    const page = await (await request.post(`/api/sites/${site.id}/pages`, { data: { title, slug: title.toLowerCase() } })).json();
    await request.put(`/api/pages/${page.id}/save`, { data: { published: true, content: [text(`t-${page.id}`, `${title} page`)] } });
    made[title] = page;
  }
  return { site, homeId: home.id as string, pages: made };
}

async function openSettings(page: Page, siteId: string, tab: string) {
  await page.goto(`/admin/sites/${siteId}`);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: tab, exact: true }).click();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
}

const desktopNav = (page: Page) => page.locator('nav[data-nav="desktop"]');

test.describe("The header", () => {
  test("carries a logo, sized, in place of the coloured square, and the download carries the picture", async ({ page, request }) => {
    const { site } = await siteWith(request, [text("t", "Hello")]);
    await request.patch(`/api/sites/${site.id}`, { data: { logo: { src: LOGO, height: 40, withName: false } } });

    await page.goto(`/sites/${site.slug}`);
    const logo = page.locator("header img.nvx-logo");
    // Alone, the picture is the site's name to a screen reader.
    await expect(logo).toHaveAttribute("alt", site.name);
    expect(await logo.evaluate((el) => (el as HTMLImageElement).getBoundingClientRect().height)).toBe(40);
    await expect(page.locator("header").getByText(site.name, { exact: true })).toHaveCount(0);

    // Set from the settings, the height and the name beside it change.
    await openSettings(page, site.id, "Header");
    await page.getByLabel("Logo height").fill("24");
    await page.getByLabel("Write the site's name beside it").check();
    await save(page);
    await page.goto(`/sites/${site.slug}`);
    expect(await page.locator("header img.nvx-logo").evaluate((el) => (el as HTMLImageElement).getBoundingClientRect().height)).toBe(24);
    await expect(page.locator("header img.nvx-logo")).toHaveAttribute("alt", "");
    await expect(page.locator("header a").first()).toContainText(site.name);

    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    expect(readFromZip(archive, "index.html")).toContain(`src="${LOGO.slice(1)}"`);
    expect(readBytesFromZip(archive, LOGO.slice(1))?.length).toBeGreaterThan(1000);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("shows the menu as arranged: a shorter label, a page left out, a link, and a dropdown", async ({ page, request }) => {
    const { site, pages } = await siteWith(request, [text("t", "Hello")], ["About", "Team", "Thanks"]);
    await openSettings(page, site.id, "Menu");

    await page.getByLabel("Label for About").fill("Us");
    await page.getByLabel("Leave Thanks out of the menu").check();
    await page.getByLabel("Put Team in a dropdown").selectOption({ label: "Us" });
    await page.getByRole("button", { name: "Add a link" }).click();
    await page.getByLabel("Label for Untitled link").fill("Shop");
    await page.getByLabel("Address for Shop", { exact: true }).fill("https://shop.example.com");
    await save(page);

    await page.goto(`/sites/${site.slug}/team`);
    const nav = desktopNav(page);
    // Team is in the closed dropdown, so not among the links a visitor can reach yet.
    await expect(nav.getByRole("link")).toHaveText(["Home", "Us ▾", "Shop"]);
    await expect(nav.getByRole("link", { name: "Thanks" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Shop" })).toHaveAttribute("href", "https://shop.example.com");

    // The dropdown is closed until its entry is hovered or reached by the keyboard.
    const team = nav.getByRole("link", { name: "Team" });
    await expect(team).toBeHidden();
    await nav.getByRole("link", { name: "Us ▾" }).hover();
    await expect(team).toBeVisible();
    await page.mouse.move(0, 400);
    await expect(team).toBeHidden();
    await nav.getByRole("link", { name: "Us ▾" }).focus();
    await expect(team).toBeVisible();
    // Its parent is shown as where the visitor is.
    await expect(team).toHaveAttribute("aria-current", "page");

    // On a phone the dropdown's pages are listed under it.
    await page.setViewportSize({ width: 480, height: 800 });
    await page.getByLabel("Menu").click();
    await expect(page.locator('nav[data-nav="mobile"]').getByRole("link")).toHaveText(["Home", "Us", "Team", "Shop"]);

    // A rename of the page leaves the menu as it was arranged.
    await request.patch(`/api/pages/${pages.About.id}`, { data: { slug: "about-us" } });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/sites/${site.slug}`);
    await expect(desktopNav(page).getByRole("link", { name: "Us ▾" })).toHaveAttribute("href", `/sites/${site.slug}/about-us`);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The footer", () => {
  test("is laid out from settings, with the legal links kept beneath it", async ({ page, request }) => {
    const { site } = await siteWith(request, [text("t", "Hello")], ["About"]);
    await openSettings(page, site.id, "Footer");
    await page.getByRole("button", { name: "Lay out a footer" }).click();
    await page.getByLabel("About the site").fill("Bread since 1990.");
    await page.getByLabel("Phone").fill("+49 30 1234567");
    await page.getByRole("button", { name: "Add a column" }).click();
    await page.getByLabel("Heading of column 1").fill("Company");
    await page.getByLabel("Label of link 1 in column 1").fill("Our story");
    await page.getByLabel("Address of link 1 in column 1", { exact: true }).fill(`/sites/${site.slug}/about`);
    await page.getByLabel("Copyright line").fill("{name} — {year}");
    await save(page);

    await page.goto(`/sites/${site.slug}`);
    const footer = page.locator("footer.nvx-footer");
    await expect(footer).toContainText("Bread since 1990.");
    await expect(footer.getByRole("link", { name: "+49 30 1234567" })).toHaveAttribute("href", "tel:+49301234567");
    await expect(footer.getByRole("navigation", { name: "Company" }).getByRole("link", { name: "Our story" })).toHaveAttribute("href", `/sites/${site.slug}/about`);
    await expect(footer).toContainText(`${site.name} — ${new Date().getFullYear()}`);

    // In the download the column's link goes to the page file beside it.
    const html = readFromZip(Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body()), "index.html") ?? "";
    expect(html).toContain('href="about.html"');
    expect(html).toContain("Bread since 1990.");

    // Custom footer HTML still wins over it, as it always has.
    await request.patch(`/api/sites/${site.id}`, { data: { footerHtml: "<p>Handwritten footer</p>" } });
    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator("footer.nvx-footer")).toHaveCount(0);
    await expect(page.getByText("Handwritten footer")).toBeVisible();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A named section", () => {
  test("is picked in a button's link field and scrolled to on the published page", async ({ page, request }) => {
    const band = {
      id: "s",
      type: "section",
      props: { background: "", paddingY: 48, paddingX: 24, maxWidth: "site", align: "left" },
      children: [{ id: "h", type: "heading", props: { text: "Simple pricing", level: 2, align: "left", color: "", weight: "bold" } }],
    };
    const button = { id: "b", type: "button", props: { label: "See prices", href: "#", variant: "primary", size: "md", align: "left", color: "", textColor: "" } };
    const spacer = { id: "sp", type: "spacer", props: { height: 1600 } };
    const { site, homeId } = await siteWith(request, [button, spacer, band]);

    await page.goto(`/admin/sites/${site.id}/pages/${homeId}`);
    await page.getByRole("button", { name: "outline", exact: true }).click();
    await page.getByRole("treeitem", { name: /Section/ }).click();
    const inspector = page.locator("aside").last();
    await inspector.getByLabel("Name for links").fill("Prices");
    await expect(inspector).toContainText("Its address is #c-prices.");

    await page.getByRole("treeitem", { name: /Button/ }).click();
    await inspector.getByLabel("Link to a page or section in this site").selectOption({ label: "Simple pricing (#prices)" });
    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });

    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator("#c-prices")).toHaveCount(1);
    await page.getByRole("link", { name: "See prices" }).click();
    await expect(page).toHaveURL(/#c-prices$/);
    await expect(page.getByRole("heading", { name: "Simple pricing" })).toBeInViewport();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A block's scroll-in motion", () => {
  test("is set in the inspector, plays as the block scrolls into view, and never while editing", async ({ page, request }) => {
    const { site, homeId } = await siteWith(request, [text("a", "Top words"), { id: "sp", type: "spacer", props: { height: 1600 } }, text("b", "Far words")]);
    await page.goto(`/admin/sites/${site.id}/pages/${homeId}`);
    await page.locator(".public-canvas .editor-block").filter({ hasText: "Far words" }).first().click();
    await page.locator("aside").last().getByLabel("On scroll").selectOption("rise");
    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });
    await expect(page.locator(".public-canvas .nvx-reveal")).toHaveCount(0);

    await page.goto(`/sites/${site.slug}`);
    const far = page.locator('.nvx-reveal[data-reveal="rise"]');
    await expect(far).toContainText("Far words");
    const opacity = () => far.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await opacity()).toBeLessThan(0.5);
    await far.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    await expect.poll(opacity).toBe(1);

    // Asked for less motion, the block simply stands there.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/sites/${site.slug}`);
    expect(await opacity()).toBe(1);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
