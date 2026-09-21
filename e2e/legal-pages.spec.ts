import { test, expect, APIRequestContext, Page } from "@playwright/test";

async function makeSite(request: APIRequestContext, templateId = "corporate") {
  const res = await request.post("/api/sites", { data: { name: `Legal ${Date.now()}-${Math.random()}`, templateId } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

const GMBH = {
  version: 1,
  legalForm: "gmbh",
  companyName: "Muster GmbH",
  representatives: ["Erika Mustermann"],
  address: { street: "Musterstraße 1", extra: "", postalCode: "10115", city: "Berlin", country: "Deutschland" },
  email: "kontakt@muster.de",
  phone: "+49 30 1234567",
  registerKind: "hrb",
  registerCourt: "Amtsgericht Berlin-Charlottenburg",
  registerNumber: "HRB 123456",
  vatId: "DE123456789",
  hostingProvider: "Hetzner Online GmbH",
  // Both of these used to have a default standing in for an answer, and the
  // generated notice made a claim on the strength of it — that an Art. 28
  // agreement exists, and that form input never leaves the browser. They are
  // asked for now, so a complete profile states them.
  hostingDpa: "yes",
  formFate: "builder",
  formRetention: "bis zur abschließenden Bearbeitung der Anfrage",
};

/** Fill in the details and write both documents, without going through the dialog. */
async function generate(request: APIRequestContext, siteId: string, over: Record<string, unknown> = {}) {
  const res = await request.post(`/api/sites/${siteId}/legal`, { data: { ...GMBH, ...over } });
  expect(res.ok(), JSON.stringify(await res.json())).toBeTruthy();
  return res.json();
}

test.describe("The legal details", () => {
  test("refuse to write a document with a blank where a fact belongs", async ({ request }) => {
    const site = await makeSite(request);
    const res = await request.post(`/api/sites/${site.id}/legal`, {
      data: { ...GMBH, registerNumber: "", address: { ...GMBH.address, city: "" } },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.missing.map((m: { field: string }) => m.field)).toEqual(
      expect.arrayContaining(["address", "registerNumber"]),
    );

    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    expect(pages.some((p: { slug: string }) => p.slug === "impressum")).toBe(false);
  });

  test("are kept as they are typed, before anything is generated", async ({ request }) => {
    const site = await makeSite(request);
    const half = { ...GMBH, registerNumber: "", hostingProvider: "" };
    expect((await request.put(`/api/sites/${site.id}/legal`, { data: half })).ok()).toBeTruthy();

    const back = await (await request.get(`/api/sites/${site.id}/legal`)).json();
    expect(back.profile.companyName).toBe("Muster GmbH");
    expect(back.missing.map((m: { field: string }) => m.field)).toEqual(
      expect.arrayContaining(["registerNumber", "hostingProvider"]),
    );
  });
});

test.describe("The generated pages", () => {
  test("carry what § 5 DDG asks for", async ({ page, request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);

    await page.goto(`/sites/${site.slug}/impressum`);
    const body = page.locator("main");
    await expect(body).toContainText("Angaben gemäß § 5 DDG");
    await expect(body).toContainText("Muster GmbH");
    await expect(body).toContainText("Vertreten durch: Erika Mustermann");
    await expect(body).toContainText("10115 Berlin");
    await expect(body).toContainText("Registernummer: HRB 123456");
    await expect(body).toContainText("DE123456789");
    // § 36 VSBG wants a statement either way; "no" is a statement.
    await expect(body).toContainText("Verbraucherschlichtungsstelle");
  });

  test("carry what Art. 13 DSGVO asks for, and describe this site rather than a generic one", async ({ page, request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);

    await page.goto(`/sites/${site.slug}/datenschutz`);
    const body = page.locator("main");
    await expect(body).toContainText("Verantwortlicher");
    await expect(body).toContainText("Hetzner Online GmbH");
    await expect(body).toContainText("Art. 15 DSGVO");
    await expect(body).toContainText("Widerspruchsrecht");
    // The corporate template is built from bundled photographs only, so the
    // honest statement is that nothing is loaded from anybody else.
    await expect(body).toContainText("setzt keine Cookies");
    await expect(body).not.toContainText("Eingebundene Inhalte Dritter");
  });

  test("name the third-party hosts a page actually reaches", async ({ page, request }) => {
    const site = await makeSite(request, "blank");
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.patch(`/api/pages/${pages[0].id}`, {
      data: {
        published: true,
        content: JSON.stringify([
          { id: "h", type: "html", props: { html: '<iframe src="https://www.youtube.com/embed/abc"></iframe>' } },
        ]),
      },
    });
    await generate(request, site.id);

    await page.goto(`/sites/${site.slug}/datenschutz`);
    await expect(page.locator("main")).toContainText("Eingebundene Inhalte Dritter");
    await expect(page.locator("main")).toContainText("www.youtube.com");
  });
});

test.describe("Both documents", () => {
  async function footerLinks(page: Page) {
    return page.locator("footer a, footer + div a, body > div > div:last-child a").allTextContents();
  }

  test("are linked in the footer of every page and subpage", async ({ page, request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const published = pages.filter((p: { published: boolean }) => p.published);
    expect(published.length).toBeGreaterThan(2);

    for (const p of published) {
      await page.goto(p.isHome ? `/sites/${site.slug}` : `/sites/${site.slug}/${p.slug}`);
      const impressum = page.locator(`a[href="/sites/${site.slug}/impressum"]`);
      const datenschutz = page.locator(`a[href="/sites/${site.slug}/datenschutz"]`);
      await expect(impressum, `Impressum link on /${p.slug}`).toHaveCount(1);
      await expect(datenschutz, `Datenschutz link on /${p.slug}`).toHaveCount(1);
    }
  });

  test("stay in the footer even when the site has a custom one that never mentions them", async ({ page, request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);
    await request.patch(`/api/sites/${site.id}`, { data: { footerHtml: "<footer><p>© {year} {name}</p></footer>" } });

    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator(`a[href="/sites/${site.slug}/impressum"]`)).toHaveCount(1);
    await expect(page.locator(`a[href="/sites/${site.slug}/datenschutz"]`)).toHaveCount(1);
  });

  test("are placed by {legal} when a custom footer asks for them, and not added twice", async ({ page, request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);
    await request.patch(`/api/sites/${site.id}`, { data: { footerHtml: "<footer><p>{name} · {legal}</p></footer>" } });

    await page.goto(`/sites/${site.slug}`);
    await expect(page.locator(`a[href="/sites/${site.slug}/impressum"]`)).toHaveCount(1);
  });

  test("stay out of the header nav, where they would crowd the real pages", async ({ page, request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);

    await page.goto(`/sites/${site.slug}`);
    const nav = page.locator('nav[data-nav="desktop"]');
    await expect(nav).toContainText("About");
    await expect(nav).not.toContainText("Impressum");
    await expect(nav).not.toContainText("Datenschutz");
  });

  test("leave the builder in the download, linked to each other as files", async ({ request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);

    const res = await request.get(`/api/sites/${site.id}/download`);
    expect(res.status()).toBe(200);
    const raw = (await res.body()).toString("binary");
    expect(raw).toContain("impressum.html");
    expect(raw).toContain("datenschutz.html");
    // A downloaded site is not served at /sites/<slug>, so a footer link that
    // still pointed there would 404 on the customer's own host.
    expect(raw).not.toContain(`/sites/${site.slug}/impressum`);
  });
});

test.describe("Running the flow again" , () => {
  test("rewrites the same two pages and keeps what was on them", async ({ request }) => {
    const site = await makeSite(request);
    const first = await generate(request, site.id);
    const impressumId = first.applied.find((a: { kind: string }) => a.kind === "impressum").id;

    const second = await generate(request, site.id, { companyName: "Muster GmbH & Co. KG" });
    expect(second.applied.find((a: { kind: string }) => a.kind === "impressum").id).toBe(impressumId);

    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    expect(pages.filter((p: { slug: string }) => p.slug.startsWith("impressum")).length).toBe(1);

    const after = await (await request.get(`/api/pages/${impressumId}`)).json();
    expect(after.content).toContain("Muster GmbH & Co. KG");

    // The version it replaced is in the page's history, not gone.
    const revisions = await (await request.get(`/api/pages/${impressumId}/revisions`)).json();
    expect(JSON.stringify(revisions)).toContain("Muster GmbH");
  });

  test("keeps the details and the pages together through an export and import", async ({ request }) => {
    const site = await makeSite(request);
    await generate(request, site.id);

    const archive = await (await request.get(`/api/sites/${site.id}/export`)).json();
    const imported = await (await request.post("/api/sites/import", { data: archive })).json();

    const pages = await (await request.get(`/api/sites/${imported.id}/pages?all=1`)).json();
    const impressum = pages.find((p: { slug: string }) => p.slug === "impressum");
    expect(impressum.legalKind).toBe("impressum");

    const legal = await (await request.get(`/api/sites/${imported.id}/legal`)).json();
    expect(legal.profile.companyName).toBe("Muster GmbH");
  });
});

test.describe("The flow", () => {
  test("asks only what this operator's legal form needs, and writes both pages", async ({ page, request }) => {
    const site = await makeSite(request);
    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: /Impressum & Datenschutz/ }).click();
    const modal = page.locator("div.max-w-2xl");

    // A sole trader is never asked for representatives.
    await expect(modal.getByLabel(/Authorised representatives/)).toHaveCount(0);
    await modal.getByLabel(/Legal form/).selectOption("gmbh");
    await expect(modal.getByLabel(/Authorised representatives/)).toHaveCount(1);

    await modal.getByLabel(/Name you trade/).fill("Muster GmbH");
    await modal.getByLabel(/Authorised representatives/).fill("Erika Mustermann");
    await modal.getByLabel(/Street and number/).fill("Musterstraße 1");
    await modal.getByLabel(/Postcode/).fill("10115");
    await modal.getByLabel(/^Town/).fill("Berlin");
    await modal.getByRole("button", { name: "Next" }).click();

    await modal.getByLabel(/^Email/).fill("kontakt@muster.de");
    await modal.getByLabel(/Telephone/).fill("+49 30 1234567");
    await modal.getByRole("button", { name: "Next" }).click();

    // Choosing GmbH already put it in Handelsregister B — the dropdown is not
    // showing a value it never stored.
    await expect(modal.getByLabel(/Register \(/)).toHaveValue("hrb");
    await modal.getByLabel(/Registering court/).fill("Amtsgericht Berlin-Charlottenburg");
    await modal.getByLabel(/Register number/).fill("HRB 123456");
    await modal.getByRole("button", { name: "Next" }).click();

    await modal.getByLabel(/Who hosts/).fill("Hetzner Online GmbH");
    // Both of these used to have a default standing in for an answer, and the
    // generated notice made a claim on the strength of it. The flow asks now,
    // and will not write the pages until it has been told (NVX-040).
    await modal.getByLabel(/data processing agreement/).selectOption("yes");
    await modal.getByLabel(/What happens to a submission/).selectOption("builder");
    await modal.getByLabel(/How long you keep it/).fill("6 Monate");
    await modal.getByRole("button", { name: "Next" }).click();

    await expect(modal).toContainText("not legal advice");
    await modal.getByRole("button", { name: /Create both pages/ }).click();
    // Text only the result screen has. The review step also mentions the
    // footer, so a looser match passed before the pages had been written.
    await expect(modal).toContainText("Both pages are live");

    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    expect(pages.filter((p: { legalKind: string | null }) => p.legalKind).length).toBe(2);
  });

  test("will not generate while something the law asks for is missing", async ({ page, request }) => {
    const site = await makeSite(request);
    await page.goto(`/admin/sites/${site.id}`);
    await page.getByRole("button", { name: /Impressum & Datenschutz/ }).click();
    const modal = page.locator("div.max-w-2xl");

    await modal.getByRole("button", { name: "Review" }).click();
    await expect(modal).toContainText("Not ready yet");
    await expect(modal.getByRole("button", { name: /Create both pages/ })).toBeDisabled();
  });
});
