import { describe, it, expect } from "vitest";
import {
  PALETTE_SIZE,
  accentRef,
  cleanHex,
  isAccentRef,
  normalizePalette,
  paletteRef,
  paletteSlotOf,
  refFallback,
  resolveColor,
} from "@/lib/palette";
import { readableTextFor, siteThemeCss, TOKEN } from "@/lib/site-theme";
import { normalizeSiteFields } from "@/lib/site-fields";
import { normalizeBlockTree } from "@/lib/block-tree";
import { backgroundStyle } from "@/lib/block-style";
import { cssColor } from "@/lib/css-value";

describe("the palette, as stored", () => {
  it("keeps six hex slots at most, each tidied, and nothing trailing", () => {
    expect(normalizePalette(["#0F766E", "", "abc", "#12", "red", "", ""])).toEqual(["#0f766e", "", "#aabbcc"]);
    expect(normalizePalette(JSON.stringify(["#111111", "#222222"]))).toEqual(["#111111", "#222222"]);
    expect(normalizePalette(Array.from({ length: 9 }, () => "#333333"))).toHaveLength(PALETTE_SIZE);
  });

  it("is empty for anything that is not a list", () => {
    expect(normalizePalette("not json")).toEqual([]);
    expect(normalizePalette({ 0: "#111111" })).toEqual([]);
    expect(normalizePalette(null)).toEqual([]);
    expect(normalizePalette(["", ""])).toEqual([]);
  });

  it("is stored repaired, and not at all when empty", () => {
    expect(normalizeSiteFields({ palette: ["#0F766E", "javascript:1", "#f59e0b"] })).toEqual({ palette: '["#0f766e","","#f59e0b"]' });
    expect(normalizeSiteFields({ palette: [] })).toEqual({ palette: null });
    expect(normalizeSiteFields({ name: "x" })).not.toHaveProperty("palette");
  });

  it("cleans a hex the way a colour picker writes one", () => {
    expect(cleanHex("#ABC")).toBe("#aabbcc");
    expect(cleanHex("0f766e")).toBe("#0f766e");
    expect(cleanHex("rgb(1,2,3)")).toBe("");
  });
});

describe("a palette colour on a block", () => {
  it("is a reference to its slot that the validator takes as a colour", () => {
    const ref = paletteRef(1, "#f59e0b");
    expect(ref).toBe("var(--site-color-2, #f59e0b)");
    expect(cssColor(ref)).toBe(ref);
    expect(paletteSlotOf(ref)).toBe(1);
    expect(paletteSlotOf("#f59e0b")).toBe(-1);
    expect(refFallback(ref)).toBe("#f59e0b");
    expect(isAccentRef(accentRef("#6366f1"))).toBe(true);
  });

  it("survives a save", () => {
    const result = normalizeBlockTree([
      { id: "h", type: "heading", props: { text: "Hi", level: 2, align: "left", color: paletteRef(0, "#0f766e"), weight: "bold" } },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].props.color).toBe("var(--site-color-1, #0f766e)");
  });

  it("is shown as the colour its slot has today, or the one it carries when the slot is empty", () => {
    const site = { accent: "#6366f1", palette: ["#be123c", ""] };
    expect(resolveColor(paletteRef(0, "#0f766e"), site)).toBe("#be123c");
    expect(resolveColor(paletteRef(1, "#f59e0b"), site)).toBe("#f59e0b");
    expect(resolveColor(accentRef("#000000"), site)).toBe("#6366f1");
    expect(resolveColor("#123456", site)).toBe("#123456");
    expect(resolveColor("rgba(0,0,0,0.5)", site)).toBe("");
  });
});

describe("the palette on the page", () => {
  it("is published as a token per slot in use, each with the text that reads on it", () => {
    const css = siteThemeCss({ palette: JSON.stringify(["#0f172a", "", "#fef08a"]) });
    expect(css).toContain("--site-color-1: #0f172a");
    expect(css).toContain("--site-color-1-contrast: #ffffff");
    expect(css).toContain("--site-color-3: #fef08a");
    expect(css).toContain("--site-color-3-contrast: #0f172a");
    expect(css).not.toContain("--site-color-2");
  });

  it("gives readable text that follows the slot, and the accent's for the accent", () => {
    expect(readableTextFor(paletteRef(0, "#0f172a"))).toBe("var(--site-color-1-contrast, #ffffff)");
    expect(readableTextFor(accentRef("#6366f1"))).toBe(TOKEN.accentContrast);
    expect(readableTextFor("#fef08a")).toBe("#0f172a");
    expect(readableTextFor("rgba(0,0,0,0.5)")).toBeNull();
  });

  it("sets the text on a section filled with one", () => {
    expect(backgroundStyle({ background: paletteRef(0, "#0f172a") })).toEqual({
      background: "var(--site-color-1, #0f172a)",
      color: "var(--site-color-1-contrast, #ffffff)",
    });
  });

  it("is offered in every colour field and the formatting toolbar", async () => {
    const { readFileSync } = await import("fs");
    const read = (path: string) => readFileSync(path, "utf8");
    expect(read("src/components/editor/inspector-fields.tsx")).toMatch(/<SiteSwatches /);
    expect(read("src/components/blocks/FormattingToolbar.tsx")).toMatch(/<SiteSwatches /);
    expect(read("src/components/editor/PageEditor.tsx")).toContain("<SiteColorsProvider value={siteColors}>");
  });
});
