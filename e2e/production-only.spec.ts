import { test, expect } from "@playwright/test";

/**
 * The things that only go wrong in a production build.
 *
 * This suite used to run against `next dev`, which is why none of these were
 * ever caught: the dev server re-reads `public/` on every request, and its
 * Content-Security-Policy carries `'unsafe-eval'` and `ws:` so the policy
 * every other assertion saw was the loose one.
 */

/** A one-pixel PNG, as bytes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("An upload", () => {
  test("is served the moment it lands, without a restart", async ({ request }) => {
    // Next 14 snapshots public/ when it builds. The upload route wrote into
    // public/uploads, so the file was on disk, the library listed it, and the
    // canvas, the published page and the OG image all answered 404 until
    // Neuravex was quit and started again.
    const upload = await request.post("/api/upload", {
      multipart: { file: { name: "probe.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(upload.ok(), await upload.text()).toBe(true);
    const { url } = await upload.json();
    expect(url).toMatch(/^\/uploads\/[a-z0-9]+\.png$/);

    const served = await request.get(url);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("image/png");
    expect(served.headers()["x-content-type-options"]).toBe("nosniff");

    await request.delete("/api/media", { data: { url } });
  });

  test("is refused when the bytes are not what the name says", async ({ request }) => {
    const res = await request.post("/api/upload", {
      multipart: {
        file: {
          name: "evil.png",
          mimeType: "image/png",
          buffer: Buffer.from("<html><script>alert(1)</script>"),
        },
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("do not match its name");
  });

  test("answers 400 on a body that is not multipart at all", async ({ request }) => {
    // Three malformed requests used to produce a 500 and a stack trace.
    const res = await request.post("/api/upload", {
      data: "not a form",
      headers: { "content-type": "text/plain" },
    });
    expect(res.status()).toBe(400);
  });

  test("is not found under a name that is not one path segment", async ({ request }) => {
    for (const name of ["..%2f..%2f.env", "%2e%2e%2f.env"]) {
      const res = await request.get(`/uploads/${name}`);
      expect(res.status(), name).toBe(404);
    }
  });
});

test.describe("The address this server answers to", () => {
  test("refuses a Host it was never told about, on GET and on POST", async ({ request }) => {
    // DNS rebinding: the attacker's name resolves to 127.0.0.1 and the page's
    // fetches are then same-origin with matching headers, which is exactly
    // what the Origin check on its own asked for.
    const get = await request.get("/api/sites", { headers: { host: "attacker.tld:3939" } });
    expect(get.status()).toBe(421);

    const post = await request.post("/api/sites", {
      data: { name: "rebind" },
      headers: { host: "attacker.tld:3939", origin: "http://attacker.tld:3939" },
    });
    expect(post.status()).toBe(421);
  });

  test("ignores X-Forwarded-Host when no proxy has been declared", async ({ request }) => {
    const res = await request.post("/api/sites", {
      data: { name: "forwarded" },
      headers: { origin: "http://evil.tld", "x-forwarded-host": "evil.tld" },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("The production policy", () => {
  test("has no unsafe-eval and no websocket in it", async ({ request }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("ws:");
  });

  test("separates a <style> element from a style attribute", async ({ request }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"]!;
    const elem = csp.split("; ").find((d) => d.startsWith("style-src-elem"));
    expect(elem).toBeTruthy();
    expect(elem).toContain("nonce-");
    expect(elem).not.toContain("unsafe-inline");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
  });

  test("asks the browser to report what it refused", async ({ request }) => {
    expect((await request.get("/")).headers()["content-security-policy"]).toContain("report-uri /api/csp-report");
  });

  test("does not announce the framework, and is not cacheable on the API", async ({ request }) => {
    const root = await request.get("/");
    expect(root.headers()["x-powered-by"]).toBeUndefined();
    expect(root.headers()["cross-origin-opener-policy"]).toBe("same-origin");
    expect(root.headers()["x-dns-prefetch-control"]).toBe("off");

    const api = await request.get("/api/sites");
    expect(api.headers()["cache-control"]).toContain("no-store");
  });

  test("keeps crawlers off the builder", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBe(true);
    const body = await robots.text();
    expect(body).toContain("Allow: /sites/");
    expect(body).toContain("Disallow: /api/");
  });
});

test.describe("What a write path will store", () => {
  test("refuses a javascript: href, whatever it is dressed as", async ({ request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Href ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();

    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: {
        content: [{ id: "b", type: "button", props: { label: "Go", href: "javascript:alert(1)" } }],
      },
    });
    const saved = await (await request.get(`/api/pages/${pages[0].id}`)).json();
    expect(saved.content).not.toContain("javascript:");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("repairs a prop that would have thrown inside the renderer", async ({ request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Props ${Date.now()}` } })).json();
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();

    // `List` maps props.items; a string here was a durable 500 on the
    // published page and on the editor the owner needed to fix it with.
    const save = await request.put(`/api/pages/${pages[0].id}/save`, {
      data: { published: true, content: [{ id: "l", type: "list", props: { items: "not an array" } }] },
    });
    expect(save.ok()).toBe(true);

    const published = await request.get(`/sites/${site.slug}`);
    expect(published.status()).toBe(200);

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });

  test("refuses a body larger than it will read, before parsing it", async ({ request }) => {
    const res = await request.post("/api/sites", {
      data: { name: "big", pad: "A".repeat(3 * 1024 * 1024) },
    });
    expect(res.status()).toBe(413);
  });
});

test.describe("A published page", () => {
  test("does not carry the site's legal profile to visitors", async ({ request }) => {
    const site = await (await request.post("/api/sites", { data: { name: `Flight ${Date.now()}` } })).json();
    await request.patch(`/api/sites/${site.id}`, {
      data: {
        customCss: ".probe-css-marker { color: red }",
        legal: JSON.stringify({ dpoName: "PROBE-DPO-NAME", dpoEmail: "probe@example.org" }),
      },
    });
    const pages = await (await request.get(`/api/sites/${site.id}/pages?all=1`)).json();
    await request.put(`/api/pages/${pages[0].id}/save`, {
      data: { published: true, content: [{ id: "t", type: "text", props: { text: "hello" } }] },
    });

    const html = await (await request.get(`/sites/${site.slug}`)).text();
    // The flight payload used to carry the whole row: the legal profile, the
    // unsanitised header/footer/CSS, and every page's content, twice.
    expect(html).not.toContain("PROBE-DPO-NAME");

    await request.delete(`/api/sites/${site.id}?permanent=1`);
  });
});
