import { describe, it, expect } from "vitest";
import { parseHex, isDarkColor, readableTextOn, siteThemeCss, TOKEN } from "@/lib/site-theme";

describe("parseHex", () => {
  it("reads both lengths, with or without the hash", () => {
    expect(parseHex("#ffffff")).toEqual([255, 255, 255]);
    expect(parseHex("000")).toEqual([0, 0, 0]);
    expect(parseHex("#F00")).toEqual([255, 0, 0]);
  });

  it("refuses anything that is not a hex colour", () => {
    for (const bad of ["red", "rgb(0,0,0)", "#12345", "", "var(--x)"]) {
      expect(parseHex(bad), bad).toBeNull();
    }
  });
});

describe("readableTextOn", () => {
  it("puts white on dark and near-black on light", () => {
    expect(readableTextOn("#0f172a")).toBe("#ffffff");
    expect(readableTextOn("#6366f1")).toBe("#ffffff");
    expect(readableTextOn("#ffffff")).toBe("#0f172a");
    // Saturated yellow is bright: black text, not white.
    expect(readableTextOn("#facc15")).toBe("#0f172a");
  });

  it("treats an unparseable colour as light rather than guessing", () => {
    expect(isDarkColor("not a colour")).toBe(false);
  });
});

describe("siteThemeCss", () => {
  it("always emits the accent and its contrast, so a block always has a fallback", () => {
    const css = siteThemeCss({ accent: "#059669" });
    expect(css).toContain("--site-accent: #059669");
    expect(css).toContain("--site-accent-contrast: #ffffff");
  });

  it("falls back to the default accent when the site has none or a bad one", () => {
    expect(siteThemeCss({})).toContain("--site-accent: #6366f1");
    expect(siteThemeCss({ accent: "javascript:alert(1)" })).toContain("--site-accent: #6366f1");
  });

  it("emits fonts and radius only when they are set", () => {
    const bare = siteThemeCss({ accent: "#000000" });
    expect(bare).not.toContain("--site-font:");
    expect(bare).not.toContain("--site-radius:");

    const full = siteThemeCss({ accent: "#000000", fontFamily: "Georgia, serif", borderRadius: "1rem" });
    expect(full).toContain("--site-font: Georgia, serif");
    expect(full).toContain("--site-radius: 1rem");
  });

  it("scopes to the selector it is given, so the editor canvas can use it", () => {
    const css = siteThemeCss({ accent: "#000000" }, ".public-canvas");
    expect(css).toContain(".public-canvas {");
    expect(css).toContain(".public-canvas h1");
    expect(css).not.toContain(":root");
  });

  it("sanitises a stored value rather than trusting it into a stylesheet", () => {
    const css = siteThemeCss({ accent: "#000000", fontFamily: 'Inter"; } body { display: none } .x {' });
    expect(css).not.toContain("display: none");
  });
});

describe("TOKEN", () => {
  it("carries its own fallback, so a block renders even with no theme on the page", () => {
    expect(TOKEN.accent).toBe("var(--site-accent, #6366f1)");
    expect(TOKEN.radius("0.5rem")).toBe("var(--site-radius, 0.5rem)");
  });
});
