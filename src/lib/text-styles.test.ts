import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  TEXT_STYLE_DEFAULTS,
  bodySizeClass,
  headingSizeClass,
  normalizeTextStyles,
  textStylesCss,
} from "@/lib/text-styles";
import { siteThemeCss } from "@/lib/site-theme";
import { normalizeSiteFields } from "@/lib/site-fields";

describe("the site's text sizes, as stored", () => {
  it("are whole px inside each one's limits", () => {
    expect(normalizeTextStyles({ h1: 52.4, h2: "40", h3: 2, h4: 500, body: 17.6, extra: 9 })).toEqual({
      h1: 52,
      h2: 40,
      h3: 12,
      h4: 72,
      body: 18,
    });
    expect(normalizeTextStyles('{"body":20}')).toEqual({ body: 20 });
  });

  it("are nothing when nothing is set, or what is set is not a number", () => {
    expect(normalizeTextStyles({ h1: "", body: "large", h2: null })).toEqual({});
    expect(normalizeTextStyles("nonsense")).toEqual({});
    expect(normalizeTextStyles([40])).toEqual({});
    expect(normalizeSiteFields({ textStyles: {} })).toEqual({ textStyles: null });
    expect(normalizeSiteFields({ textStyles: { h1: 44 } })).toEqual({ textStyles: '{"h1":44}' });
  });

  it("default to what the blocks have always drawn on a wide window", () => {
    expect(TEXT_STYLE_DEFAULTS).toEqual({ h1: 60, h2: 48, h3: 30, h4: 24, body: 16 });
  });
});

describe("the site's text sizes on the page", () => {
  it("draw a heading at its size on a wide window and four fifths of it on a narrow one", () => {
    const css = textStylesCss({ h2: 40 });
    expect(css).toContain(":root .nvx-heading-2 { font-size: 32px; }");
    expect(css).toContain("@media (min-width: 768px) { :root .nvx-heading-2 { font-size: 40px; } }");
    expect(css).not.toContain("nvx-heading-1");
  });

  it("put the body size on the body, and scale a text block's four sizes from it", () => {
    const css = textStylesCss({ body: 20 });
    expect(css).toContain(":root body { font-size: 20px; }");
    expect(css).toContain(":root .nvx-text-sm { font-size: 17.5px; }");
    expect(css).toContain(":root .nvx-text-base { font-size: 20px; }");
    expect(css).toContain(":root .nvx-text-xl { font-size: 25px; }");
    // Never on :root, which is what a rem is.
    expect(css).not.toMatch(/:root \{/);
  });

  it("stay inside the canvas in the editor", () => {
    const css = textStylesCss({ h1: 50, body: 18 }, ".public-canvas");
    expect(css).toContain(".public-canvas { font-size: 18px; }");
    expect(css).toContain(".public-canvas .nvx-heading-1 { font-size: 40px; }");
    expect(css).not.toContain(":root");
  });

  it("add nothing at all to a site that sets none", () => {
    expect(textStylesCss(null)).toBe("");
    expect(siteThemeCss({ accent: "#000000" })).not.toContain("font-size");
    expect(siteThemeCss({ textStyles: '{"h3":28}' })).toContain(":root .nvx-heading-3 { font-size: 22.4px; }");
  });

  it("are found by the classes the heading and text blocks carry", () => {
    expect(headingSizeClass(3)).toBe("nvx-heading-3");
    expect(bodySizeClass("lg")).toBe("nvx-text-lg");
    // The heading is found by the size it is drawn at, which may not be its level.
    expect(readFileSync("src/components/blocks/Heading.tsx", "utf8")).toContain("headingSizeClass(props.size ?? props.level)");
    expect(readFileSync("src/components/blocks/Text.tsx", "utf8")).toContain("bodySizeClass(props.size)");
  });
});
