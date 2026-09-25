import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFromZip } from "./zip";

/**
 * Forms were inert on every published page: the block read its read-only
 * render flag as "do not accept input", so visitors could not type in a field
 * or press the button, and no submission could ever be recorded.
 */
test.describe("Published forms", () => {
  test("a visitor can fill in and submit a form", async ({ page, request }) => {
    const created = await request.post("/api/sites", {
      data: { name: `Form E2E ${Date.now()}`, templateId: "blank" },
    });
    const site = await created.json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    const pageId = pages[0].id;

    await request.put(`/api/pages/${pageId}/save`, {
      data: {
        title: "Contact",
        published: true,
        content: [
          {
            id: "form-1",
            type: "form",
            props: {
              submitLabel: "Send",
              successMessage: "Thanks!",
              fields: [
                { label: "Email", type: "text", required: false },
                { label: "Email", type: "text", required: false },
                { label: "Message", type: "textarea", required: false },
              ],
            },
          },
        ],
      },
    });

    await page.goto(`/sites/${site.slug}`);

    const inputs = page.locator("form input");
    await expect(inputs.first()).toBeEnabled();
    await inputs.nth(0).fill("first@example.com");
    await inputs.nth(1).fill("second@example.com");
    await page.locator("form textarea").fill("hello");
    // A person takes longer than a program to fill a form in, and the route
    // refuses what arrives sooner than that; see `MIN_FILL_MS`.
    await page.waitForTimeout(3100);
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByText("Thanks!")).toBeVisible();

    // A total and an offset, not a bare array: `take: 100` with nothing
    // saying how many there were hid a form filling up.
    const stored = await (await request.get(`/api/pages/${pageId}/submissions`)).json();
    expect(stored.total).toBe(1);
    expect(stored.submissions).toHaveLength(1);
    // Two fields share the label "Email" — both answers have to survive.
    expect(JSON.parse(stored.submissions[0].data)).toEqual({
      Email: "first@example.com",
      "Email 2": "second@example.com",
      Message: "hello",
    });

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("the editor keeps form inputs inert", async ({ page, request }) => {
    const created = await request.post("/api/sites", {
      data: { name: `Form Editor E2E ${Date.now()}`, templateId: "blank" },
    });
    const site = await created.json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();

    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: {
        title: "Contact",
        content: [
          {
            id: "form-1",
            type: "form",
            props: {
              submitLabel: "Send",
              successMessage: "Thanks!",
              fields: [{ label: "Name", type: "text", required: false }],
            },
          },
        ],
      },
    });

    await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);
    await expect(page.locator("form input").first()).toBeDisabled();
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("oversized submissions are refused", async ({ request }) => {
    const created = await request.post("/api/sites", {
      data: { name: `Form Size E2E ${Date.now()}`, templateId: "blank" },
    });
    const site = await created.json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();

    const res = await request.post("/api/submissions", {
      data: { pageId: pages[0].id, data: { blob: "x".repeat(100_000) } },
    });
    expect(res.status()).toBe(413);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

/** A published site whose one page holds this form. */
async function formSite(request: APIRequestContext, props: Record<string, unknown>) {
  const site = await (await request.post("/api/sites", { data: { name: `Form ${Date.now()}${Math.random()}`, templateId: "blank" } })).json();
  const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
  const res = await request.put(`/api/pages/${pages[0].id}/save`, {
    data: {
      title: "Contact",
      published: true,
      content: [{ id: "form-1", type: "form", props: { submitLabel: "Send", successMessage: "Thanks!", ...props } }],
    },
  });
  expect(res.ok()).toBe(true);
  return { site, pageId: pages[0].id as string };
}

const stored = async (request: APIRequestContext, pageId: string) =>
  (await (await request.get(`/api/pages/${pageId}/submissions`)).json()) as { total: number; submissions: { data: string }[] };

test.describe("Every kind of field", () => {
  test("is drawn with its label, and its answer is stored", async ({ page, request }) => {
    const { site, pageId } = await formSite(request, {
      fields: [
        { label: "Phone", type: "tel", required: false, placeholder: "+49 …", help: "We call back within a day." },
        { label: "Guests", type: "number", required: false },
        { label: "Arrival", type: "date", required: false },
        { label: "Room", type: "select", required: true, options: ["Single", "Double"] },
        { label: "Breakfast", type: "radio", required: true, options: ["Yes please", "No thanks"] },
        { label: "Extras", type: "checkboxes", required: false, options: ["Parking", "Late checkout", "Pet"] },
        { label: 'I have read the <a href="/impressum">notice</a>', type: "consent", required: true },
      ],
    });
    await page.goto(`/sites/${site.slug}`);

    // Every field is reached by its own label, and help is read out with it.
    await expect(page.getByLabel("Phone")).toHaveAttribute("type", "tel");
    await expect(page.getByLabel("Phone")).toHaveAttribute("placeholder", "+49 …");
    await expect(page.getByLabel("Phone")).toHaveAccessibleDescription("We call back within a day.");
    await page.getByLabel("Phone").fill("+49 30 123");
    await page.getByLabel("Guests").fill("2");
    await page.getByLabel("Arrival").fill("2026-10-01");
    await page.getByLabel("Room").selectOption("Double");
    await page.getByRole("group", { name: "Breakfast" }).getByLabel("No thanks").check();
    const extras = page.getByRole("group", { name: "Extras" });
    await extras.getByLabel("Parking").check();
    await extras.getByLabel("Pet").check();
    await page.getByRole("checkbox", { name: "I have read the notice" }).check();

    await page.waitForTimeout(3100);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Thanks!")).toBeVisible();

    const { submissions } = await stored(request, pageId);
    expect(JSON.parse(submissions[0].data)).toEqual({
      Phone: "+49 30 123",
      Guests: "2",
      Arrival: "2026-10-01",
      Room: "Double",
      Breakfast: "No thanks",
      Extras: "Parking, Pet",
      "I have read the notice": "Yes",
    });

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("that is required and ticked nowhere is asked for, not sent empty", async ({ page, request }) => {
    const { site, pageId } = await formSite(request, {
      fields: [{ label: "Days", type: "checkboxes", required: true, options: ["Monday", "Friday"] }],
    });
    await page.goto(`/sites/${site.slug}`);
    await page.waitForTimeout(3100);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Please tick at least one.")).toBeVisible();
    expect((await stored(request, pageId)).total).toBe(0);

    await page.getByLabel("Friday").check();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Thanks!")).toBeVisible();

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("Keeping programs out", () => {
  const fields = [{ label: "Name", type: "text", required: false }];

  test("a form sent the moment it appears is refused out loud, and goes the second time", async ({ page, request }) => {
    const { site, pageId } = await formSite(request, { fields });
    await page.goto(`/sites/${site.slug}`);
    await page.getByLabel("Name").fill("Quick");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("press Send again");
    expect((await stored(request, pageId)).total).toBe(0);

    await page.waitForTimeout(3100);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Thanks!")).toBeVisible();
    expect((await stored(request, pageId)).total).toBe(1);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("a form with its trap filled in is thanked, and nothing is kept", async ({ page, request }) => {
    const { site, pageId } = await formSite(request, { fields });
    await page.goto(`/sites/${site.slug}`);
    // What a program does: every box it can find, the hidden one included.
    await page.locator('input[name="_gotcha"]').fill("http://spam.example", { force: true });
    await page.getByLabel("Name").fill("Bot");
    await page.waitForTimeout(3100);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Thanks!")).toBeVisible();
    expect((await stored(request, pageId)).total).toBe(0);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("the trap is out of reach of a keyboard and a screen reader", async ({ page, request }) => {
    const { site } = await formSite(request, { fields });
    await page.goto(`/sites/${site.slug}`);
    const trap = page.locator('input[name="_gotcha"]');
    await expect(trap).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("textbox")).toHaveCount(1);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("A downloaded form", () => {
  test("posts to the service it was given, and the page allows that address alone", async ({ request }) => {
    const { site } = await formSite(request, {
      fields: [{ label: "Email", type: "email", required: true }],
      destination: "https://formspree.io/f/xyzzy",
    });
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const html = readFromZip(archive, "index.html") ?? "";

    expect(html).toMatch(/<form[^>]*action="https:\/\/formspree\.io\/f\/xyzzy"[^>]*method="post"/);
    expect(html).toContain('name="Email"');
    expect(html).not.toContain('onsubmit="return false"');
    expect(html).not.toContain("cannot send anything");
    expect(html).toContain("form-action https://formspree.io\"");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("with nowhere to send still says so, and the page allows nothing", async ({ request }) => {
    const { site } = await formSite(request, { fields: [{ label: "Email", type: "email", required: true }] });
    const archive = Buffer.from(await (await request.get(`/api/sites/${site.id}/download`)).body());
    const html = readFromZip(archive, "index.html") ?? "";
    expect(html).toContain('onsubmit="return false"');
    expect(html).toContain("cannot send anything");
    expect(html).toContain("form-action 'none'");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("The form panel", () => {
  test("adds a privacy checkbox that links the site's notice", async ({ page, request }) => {
    const { site, pageId } = await formSite(request, { fields: [{ label: "Name", type: "text", required: true }] });
    const legal = await request.post(`/api/sites/${site.id}/legal`, {
      data: {
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
        hostingProvider: "Hetzner Online GmbH",
        hostingDpa: "yes",
        formFate: "builder",
        formRetention: "bis zur abschließenden Bearbeitung der Anfrage",
      },
    });
    expect(legal.ok(), await legal.text()).toBe(true);

    await page.goto(`/admin/sites/${site.id}/pages/${pageId}`);
    await page.locator(".public-canvas .editor-block").first().click();
    await page.getByRole("button", { name: "+ Add privacy checkbox" }).click();

    const box = page.locator(".public-canvas form").getByRole("checkbox");
    await expect(box).toHaveCount(1);
    await expect(page.locator(".public-canvas form label a")).toHaveAttribute("href", `/sites/${site.slug}/datenschutz`);

    // And a field turned into a dropdown is drawn as one.
    await page.getByRole("combobox").filter({ hasText: "Short text" }).first().selectOption("select");
    await expect(page.locator(".public-canvas form select")).toHaveCount(1);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

