import { test, expect, APIRequestContext } from "@playwright/test";

/** A site of our own, so the demo site's pages are not in the way. */
async function makeSite(request: APIRequestContext, name: string) {
  const res = await request.post("/api/sites", { data: { name, templateId: "blank" } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe("Adding a page to a site", () => {
  test("shows the address the page will actually have", async ({ page, request }) => {
    // The dialog used to promise "URL: /sites/<site>/auto" — the site was
    // never named, and neither was the page being created, so the one line
    // telling you where your page would live told you nothing.
    const site = await makeSite(request, `Crème Site ${Date.now()}`);
    await page.goto(`/admin/sites/${site.id}`);
    await page.click('button:has-text("New page")');

    const url = page.locator("p", { hasText: "URL:" });
    await expect(url).toContainText(`/sites/${site.slug}/`);

    await page.getByLabel("Title").fill("Crème Brûlée");
    await expect(url).toContainText(`/sites/${site.slug}/creme-brulee`);

    // A slug typed by hand wins, and is shown the way the server will store it.
    await page.getByLabel("Slug (optional)").fill("Our Menu");
    await expect(url).toContainText(`/sites/${site.slug}/our-menu`);
  });

  test("is finished by pressing Enter", async ({ page, request }) => {
    const site = await makeSite(request, `Enter Site ${Date.now()}`);
    await page.goto(`/admin/sites/${site.id}`);
    await page.click('button:has-text("New page")');
    await page.getByLabel("Title").fill("About");
    await page.keyboard.press("Enter");

    await page.waitForURL(/\/pages\//);
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    expect(pages.map((p: { slug: string }) => p.slug)).toContain("about");
  });
});

test.describe("A name with accents in it", () => {
  test("keeps its letters in the site's address", async ({ request }) => {
    // "Résumé" was published at /sites/r-sum: every accented letter was
    // dropped along with its accent.
    const site = await makeSite(request, "Café Résumé Ångström");
    expect(site.slug).toMatch(/^cafe-resume-angstrom(-\d+)?$/);
  });
});
