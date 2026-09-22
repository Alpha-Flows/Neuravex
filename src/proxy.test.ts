import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, contentSecurityPolicy, isServableHost } from "./proxy";

/**
 * The Origin check is the whole of the CSRF defence and, until now, it was
 * asserted in one Playwright spec that CI never ran. A refactor of this file
 * could land green. These are the assertions that belong next to the code.
 */

/** A request the way Next hands one to the proxy. */
function request(
  url: string,
  { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {},
) {
  const parsed = new URL(url);
  // A hand-built NextRequest has no Host header unless it is given one, and
  // the whole check turns on it.
  return new NextRequest(url, {
    method,
    headers: { host: parsed.host, ...headers },
  });
}

const env = { ...process.env };
beforeEach(() => {
  delete process.env.NEURAVEX_ALLOWED_HOSTS;
  delete process.env.NEURAVEX_TRUST_PROXY;
});
afterEach(() => {
  process.env = { ...env };
});

describe("which addresses this server answers to", () => {
  it("answers on loopback and on IP literals", () => {
    for (const host of ["localhost:3939", "localhost", "127.0.0.1:3939", "192.168.1.4:3939", "[::1]:3939"]) {
      expect(isServableHost(host)).toBe(true);
    }
  });

  it("refuses a name nobody configured", () => {
    expect(isServableHost("attacker.tld:3939")).toBe(false);
    expect(isServableHost("neuravex.example.com")).toBe(false);
    expect(isServableHost(null)).toBe(false);
    expect(isServableHost("")).toBe(false);
  });

  it("answers on a name the operator listed", () => {
    process.env.NEURAVEX_ALLOWED_HOSTS = "neuravex.example.com, other.example";
    expect(isServableHost("neuravex.example.com:443")).toBe(true);
    expect(isServableHost("OTHER.EXAMPLE")).toBe(true);
    expect(isServableHost("attacker.tld")).toBe(false);
  });

  it("is not fooled by a name that merely ends in an allowed one", () => {
    process.env.NEURAVEX_ALLOWED_HOSTS = "example.com";
    expect(isServableHost("evil-example.com")).toBe(false);
    expect(isServableHost("example.com.evil.tld")).toBe(false);
  });
});

describe("DNS rebinding", () => {
  // The attack: attacker.tld resolves to the attacker's server, then flips to
  // 127.0.0.1. From then on the page's fetches carry a matching Origin and
  // Host, which is exactly what the old check asked for.
  it("refuses a foreign Host on POST even when Origin matches it", async () => {
    const res = await proxy(
      request("http://attacker.tld:3939/api/sites", {
        method: "POST",
        headers: { host: "attacker.tld:3939", origin: "http://attacker.tld:3939" },
      }),
    );
    expect(res.status).toBe(421);
  });

  it("refuses a foreign Host on GET as well", async () => {
    // A GET is enough: the export route hands back every site as JSON.
    const res = await proxy(
      request("http://attacker.tld:3939/api/sites/x/export", { headers: { host: "attacker.tld:3939" } }),
    );
    expect(res.status).toBe(421);
  });

  it("still answers the owner's own browser", async () => {
    const res = await proxy(request("http://localhost:3939/api/sites"));
    expect(res.status).toBe(200);
  });
});

describe("the Origin check", () => {
  it("refuses a POST from another site", async () => {
    const res = await proxy(
      request("http://localhost:3939/api/sites", {
        method: "POST",
        headers: { origin: "http://evil.tld" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("allows a POST from this site", async () => {
    const res = await proxy(
      request("http://localhost:3939/api/sites", {
        method: "POST",
        headers: { origin: "http://localhost:3939" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("allows a POST with no Origin at all — that is a terminal, not a page", async () => {
    const res = await proxy(request("http://localhost:3939/api/sites", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("refuses an Origin that is not a URL", async () => {
    const res = await proxy(
      request("http://localhost:3939/api/sites", { method: "POST", headers: { origin: "null" } }),
    );
    expect(res.status).toBe(403);
  });

  it("leaves GET alone", async () => {
    const res = await proxy(
      request("http://localhost:3939/api/sites", { headers: { origin: "http://evil.tld" } }),
    );
    expect(res.status).toBe(200);
  });
});

describe("X-Forwarded-Host", () => {
  it("is ignored unless the operator says there is a proxy", async () => {
    const res = await proxy(
      request("http://localhost:3939/api/sites", {
        method: "POST",
        headers: { host: "localhost:3939", origin: "http://evil.tld", "x-forwarded-host": "evil.tld" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("is honoured, and still host-checked, when it is trusted", async () => {
    process.env.NEURAVEX_TRUST_PROXY = "1";
    process.env.NEURAVEX_ALLOWED_HOSTS = "neuravex.example.com";

    const good = await proxy(
      request("http://localhost:3939/api/sites", {
        method: "POST",
        headers: {
          host: "localhost:3939",
          origin: "https://neuravex.example.com",
          "x-forwarded-host": "neuravex.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(good.status).toBe(200);

    const bad = await proxy(
      request("http://localhost:3939/api/sites", {
        method: "POST",
        headers: {
          host: "localhost:3939",
          origin: "https://evil.tld",
          "x-forwarded-host": "evil.tld",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(bad.status).toBe(421);
  });

  it("compares the scheme too once the proxy reports it", async () => {
    process.env.NEURAVEX_TRUST_PROXY = "1";
    process.env.NEURAVEX_ALLOWED_HOSTS = "neuravex.example.com";
    const res = await proxy(
      request("http://localhost:3939/api/sites", {
        method: "POST",
        headers: {
          host: "localhost:3939",
          origin: "http://neuravex.example.com",
          "x-forwarded-host": "neuravex.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("the policy the page carries", () => {
  it("names the nonce and nothing looser, in production", () => {
    const csp = contentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("ws:");
  });

  it("separates a <style> element from a style attribute", () => {
    const csp = contentSecurityPolicy("abc123", false);
    // An element carries the nonce; an attribute cannot, so that is where the
    // sanitiser does the work instead.
    expect(csp).toContain("style-src-elem 'self' 'nonce-abc123'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp.split("; ").find((d) => d.startsWith("style-src-elem"))).not.toContain("unsafe-inline");
  });

  it("frames only the embed hosts, exactly", () => {
    const csp = contentSecurityPolicy("abc123", false);
    expect(csp).toContain("frame-src https://www.youtube.com");
    expect(csp).not.toContain("youtube.com.evil");
  });

  it("asks the browser to report what it refused", () => {
    expect(contentSecurityPolicy("abc123", false)).toContain("report-uri /api/csp-report");
  });

  it("is on the response, and on the request for Next to read back", async () => {
    const res = await proxy(request("http://localhost:3939/"));
    expect(res.headers.get("content-security-policy")).toContain("nonce-");
  });
});
