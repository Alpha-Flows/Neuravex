import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { internalOrigin, publicOrigin } from "@/lib/self-origin";

const env = { ...process.env };
beforeEach(() => {
  delete process.env.PUBLIC_URL;
  delete process.env.NEURAVEX_TRUST_PROXY;
  delete process.env.PORT;
});
afterEach(() => {
  process.env = { ...env };
});

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("how this process reaches itself", () => {
  it("is loopback and plain http, whatever a client says", () => {
    process.env.PORT = "3939";
    expect(internalOrigin()).toBe("http://127.0.0.1:3939");
  });

  it("cannot be talked into https by a forwarded header", () => {
    // Next takes `req.url`'s scheme from X-Forwarded-Proto, and the nginx
    // recipe sets it to $scheme — so the download route used to fetch its own
    // plaintext port over TLS and die with an unhandled 500.
    process.env.PORT = "3939";
    process.env.NEURAVEX_TRUST_PROXY = "1";
    expect(internalOrigin()).toBe("http://127.0.0.1:3939");
  });
});

describe("the address visitors use", () => {
  it("is PUBLIC_URL when the operator has stated it", () => {
    process.env.PUBLIC_URL = "https://example.com/";
    expect(publicOrigin(headers({ host: "localhost:3939" }))).toBe("https://example.com");
  });

  it("ignores forwarded headers unless there is a proxy in front", () => {
    const h = headers({ host: "localhost:3939", "x-forwarded-host": "evil.tld", "x-forwarded-proto": "https" });
    expect(publicOrigin(h)).toBe("http://localhost:3939");
  });

  it("uses them once the operator says there is", () => {
    process.env.NEURAVEX_TRUST_PROXY = "1";
    const h = headers({ host: "localhost:3939", "x-forwarded-host": "example.com", "x-forwarded-proto": "https" });
    expect(publicOrigin(h)).toBe("https://example.com");
  });

  it("falls back to localhost when nothing says otherwise", () => {
    process.env.PORT = "3939";
    expect(publicOrigin()).toBe("http://localhost:3939");
  });
});
