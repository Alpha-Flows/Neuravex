import { test, expect, APIRequestContext } from "@playwright/test";

async function makeSite(request: APIRequestContext, templateId: string) {
  const res = await request.post("/api/sites", { data: { name: `MP ${Date.now()}-${Math.random()}`, templateId } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe("A page added to a site", () => {
  test("arrives dressed like the site it was made in", async ({ request }) => {
    // "+ New page" used to hand over an empty page: on a site built from a
    // template, the first block dropped onto it landed flush in the corner at
    // the full width of the window, while every other page in the site sat in
    // a contained column with its own background and 96px of air.
    const site = await makeSite(request, "saas-landing");
    const page = await (await request.post(`/api/sites/${site.id}/pages`, { data: { title: "About" } })).json();

    const blocks = JSON.parse(page.content);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe("section");
    // The look the SaaS template actually has: white bands, 96px, site width.
    expect(blocks[0].props).toMatchObject({ background: "#ffffff", paddingY: 96, maxWidth: "site" });
  });

  test("is still allowed to be empty when that is what was asked for", async ({ request }) => {
    const site = await makeSite(request, "saas-landing");
    const page = await (await request.post(`/api/sites/${site.id}/pages`, {
      data: { title: "Scratch", starter: "blank" },
    })).json();
    expect(page.content).toBe("[]");
  });

  test("can be started from a layout chosen in the dialog", async ({ page, request }) => {
    const site = await makeSite(request, "corporate");
    await page.goto(`/admin/sites/${site.id}`);
    await page.click('button:has-text("New page")');
    await page.getByLabel("Title").fill("Pricing");
    await page.click('button:has-text("Pricing") >> nth=-1');
    await page.click('button:has-text("Create")');
    await page.waitForURL(/\/pages\//);

    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const pricing = pages.find((p: { slug: string }) => p.slug === "pricing");
    const blocks = JSON.parse(pricing.content);
    expect(JSON.stringify(blocks)).toContain("Questions people ask");
    // Drawn in the corporate template's own look, not a house style.
    expect(blocks[0].props).toMatchObject({ background: "#ffffff", paddingY: 96 });
  });
});

test.describe("A block with no colour of its own", () => {
  test("is readable on a dark section", async ({ page, request }) => {
    // The palette inserts blocks with an empty colour, which means "whatever
    // the page says". A dark section said nothing, so the page said near-black
    // and a heading dropped onto #0b0f1e was written in #0f172a.
    const site = await makeSite(request, "blank");
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.patch(`/api/pages/${pages[0].id}`, {
      data: {
        published: true,
        content: JSON.stringify([
          {
            id: "s1", type: "section",
            props: { background: "#0b0f1e", paddingY: 80, paddingX: 24, maxWidth: "site", align: "center" },
            children: [
              { id: "h1", type: "heading", props: { text: "Can you read this?", level: 1, align: "center", color: "", weight: "bold" } },
            ],
          },
        ]),
      },
    });

    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator("h1")).toHaveCSS("color", "rgb(255, 255, 255)");
  });

  test("includes a form's field labels", async ({ page, request }) => {
    // A Contact page is the page most likely to land on a site's dark band,
    // and the label was hard-coded slate-700 — a field nobody could read the
    // name of.
    const site = await makeSite(request, "saas-landing");
    const contact = await (await request.post(`/api/sites/${site.id}/pages`, {
      data: { title: "Contact", starter: "contact" },
    })).json();
    await request.patch(`/api/pages/${contact.id}`, { data: { published: true } });

    await page.goto(`/sites/${site.slug}/contact`);
    const label = page.locator("label", { hasText: "Name" }).first();
    const [labelColor, backdrop] = await Promise.all([
      label.evaluate((el) => getComputedStyle(el).color),
      label.evaluate((el) => {
        let node: HTMLElement | null = el as HTMLElement;
        while (node) {
          const bg = getComputedStyle(node).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)") return bg;
          node = node.parentElement;
        }
        return "rgb(255, 255, 255)";
      }),
    ]);
    // Light text on the dark band it is standing on, rather than near-black.
    const lum = (c: string) => {
      const [r, g, b] = c.match(/\d+/g)!.map(Number);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    expect(lum(backdrop)).toBeLessThan(140);
    expect(lum(labelColor)).toBeGreaterThan(140);
  });
});

test.describe("Renaming", () => {
  test("takes the links to a page with it", async ({ request }) => {
    const site = await makeSite(request, "blank");
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const home = pages[0];
    const pricing = await (await request.post(`/api/sites/${site.id}/pages`, {
      data: { title: "Pricing", starter: "blank" },
    })).json();

    await request.patch(`/api/pages/${home.id}`, {
      data: {
        content: JSON.stringify([
          { id: "b1", type: "button", props: { label: "Plans", href: `/sites/${site.slug}/pricing` } },
          { id: "b2", type: "button", props: { label: "Away", href: "https://example.com/pricing" } },
          { id: "h1", type: "html", props: { html: `<a href="/sites/${site.slug}/pricing">Plans</a>` } },
        ]),
      },
    });

    const renamed = await (await request.patch(`/api/pages/${pricing.id}`, { data: { slug: "plans" } })).json();
    expect(renamed.relinked).toBe(2);

    const after = JSON.parse((await (await request.get(`/api/pages/${home.id}`)).json()).content);
    expect(after[0].props.href).toBe(`/sites/${site.slug}/plans`);
    expect(after[1].props.href).toBe("https://example.com/pricing");
    expect(after[2].props.html).toContain(`/sites/${site.slug}/plans`);
  });

  test("takes the links in a whole site with it", async ({ request }) => {
    const site = await makeSite(request, "blank");
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.patch(`/api/pages/${pages[0].id}`, {
      data: { content: JSON.stringify([{ id: "b1", type: "button", props: { label: "Home", href: `/sites/${site.slug}` } }]) },
    });
    await request.patch(`/api/sites/${site.id}`, { data: { headerHtml: `<a href="/sites/${site.slug}/about">About</a>` } });

    const slug = `renamed-${Date.now()}`;
    const renamed = await (await request.patch(`/api/sites/${site.id}`, { data: { slug } })).json();
    expect(renamed.slug).toBe(slug);
    expect(renamed.relinked).toBe(2);

    const after = JSON.parse((await (await request.get(`/api/pages/${pages[0].id}`)).json()).content);
    expect(after[0].props.href).toBe(`/sites/${slug}`);
    expect((await (await request.get(`/api/sites/${site.id}`)).json()).headerHtml).toContain(`/sites/${slug}/about`);
  });

  test("leaves a renamed page reachable at its new address", async ({ page, request }) => {
    const site = await makeSite(request, "blank");
    const about = await (await request.post(`/api/sites/${site.id}/pages`, { data: { title: "About" } })).json();
    await request.patch(`/api/pages/${about.id}`, { data: { published: true, slug: "our-story" } });

    await page.goto(`/sites/${site.slug}/our-story`);
    await expect(page.locator("h1")).toContainText("About");
  });
});

test.describe("The link picker", () => {
  test("writes the address of a page picked from the list", async ({ page, request }) => {
    // Linking to your own Contact page meant typing `/sites/<site>/contact`
    // from memory into a box that would not have told you either way.
    const site = await makeSite(request, "saas-landing");
    await request.post(`/api/sites/${site.id}/pages`, { data: { title: "Contact", starter: "contact" } });
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const home = pages.find((p: { isHome: boolean }) => p.isHome);

    await page.goto(`/admin/sites/${site.id}/pages/${home.id}`);
    await page.getByText("Start building free").first().click();

    // The right-hand rail: the block palette is an aside too.
    const inspector = page.locator("aside").last();
    const picker = inspector.locator("select").first();
    await expect(picker).toBeVisible();
    await picker.selectOption("contact");

    await expect(inspector.locator("input").nth(1)).toHaveValue(`/sites/${site.slug}/contact`);
    // The page is a draft, and saying so now is cheaper than a visitor finding out.
    await expect(inspector).toContainText("draft");
  });

  test("says so when a link points at no page of this site", async ({ page, request }) => {
    const site = await makeSite(request, "saas-landing");
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const home = pages.find((p: { isHome: boolean }) => p.isHome);

    await page.goto(`/admin/sites/${site.id}/pages/${home.id}`);
    await page.getByText("Start building free").first().click();
    const inspector = page.locator("aside").last();
    await inspector.locator("input").nth(1).fill(`/sites/${site.slug}/nowhere`);

    await expect(inspector).toContainText("this link will 404");
  });
});

test.describe("A multi-page template", () => {
  test("creates every one of its pages, linked to each other", async ({ page, request }) => {
    const site = await makeSite(request, "restaurant");
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    expect(pages.map((p: { slug: string }) => p.slug)).toEqual(["index", "menu", "visit"]);

    // The stand-in a template writes for the site address is resolved on
    // creation — an unresolved one would ship `{{site}}/menu` into the page.
    const home = pages.find((p: { isHome: boolean }) => p.isHome);
    expect(home.content).not.toContain("{{site}}");
    expect(home.content).toContain(`/sites/${site.slug}/menu`);

    // And the link works from the published page.
    await page.goto(`/sites/${site.slug}`);
    await page.getByRole("link", { name: /View the menu/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.slug}/menu$`));
    await expect(page.locator("h1")).toContainText("The menu");
  });

  test("shows every published page in the site nav", async ({ page, request }) => {
    const site = await makeSite(request, "agency");
    await page.goto(`/sites/${site.slug}`);
    const nav = page.locator('nav[data-nav="desktop"]');
    await expect(nav).toContainText("Home");
    await expect(nav).toContainText("Services");
    await expect(nav).toContainText("Contact");
  });
});
