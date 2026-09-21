import { test, expect } from "@playwright/test";

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
