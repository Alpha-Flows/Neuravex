import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { anchorHref, anchorId, anchorOfHref, cleanAnchor, fragmentLink, sectionAnchors } from "@/lib/anchors";
import { sanitizeInlineHtml } from "@/lib/sanitize";
import { normalizeBlockTree } from "@/lib/block-tree";
import { normalizeMotion } from "@/lib/block-motion";
import { siteThemeCss } from "@/lib/site-theme";
import type { BaseBlock } from "@/types";

const section = (id: string, anchor: string | undefined, heading?: string): BaseBlock => ({
  id,
  type: "section",
  props: { background: "", paddingY: 48, paddingX: 24, maxWidth: "site", align: "left", anchor },
  children: heading ? [{ id: `${id}-h`, type: "heading", props: { text: heading, level: 2, align: "left", color: "", weight: "bold" } }] : [],
});

describe("a section's name", () => {
  it("is what can go in an address", () => {
    expect(cleanAnchor("Our Team")).toBe("our-team");
    expect(cleanAnchor("  Préise & Pakete! ")).toBe("preise-pakete");
    expect(cleanAnchor("---")).toBe("");
    expect(cleanAnchor(42)).toBe("");
    expect(cleanAnchor("x".repeat(100))).toHaveLength(60);
  });

  it("is kept through a save, cleaned, and dropped when nothing is left", () => {
    const result = normalizeBlockTree([section("a", "Our Team"), section("b", "!!!")]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].props.anchor).toBe("our-team");
    expect(result.tree[1].props.anchor).toBeUndefined();
  });

  it("is the id the sanitiser gives a typed #fragment, so both kinds of link land on it", () => {
    // A link typed into a paragraph is prefixed by the sanitiser...
    expect(sanitizeInlineHtml('<a href="#our-team">team</a>')).toContain(`href="${anchorHref("our-team")}"`);
    // ...and a button or menu link typed the same way is given the same prefix.
    expect(fragmentLink("#our-team")).toBe("#c-our-team");
    expect(anchorId("our-team")).toBe("c-our-team");
  });

  it("leaves the top of the page, a prefixed link and the blocks' own ids as they are", () => {
    expect(fragmentLink("#")).toBe("#");
    expect(fragmentLink("#c-x")).toBe("#c-x");
    expect(fragmentLink("#nvx-gallery-1")).toBe("#nvx-gallery-1");
    expect(fragmentLink("/sites/a#x")).toBe("/sites/a#x");
    expect(anchorOfHref("#prices")).toBe("prices");
    expect(anchorOfHref("https://x.example")).toBe("");
  });

  it("is listed once per name, in page order, with the heading that says what is there", () => {
    const tree = [section("a", "prices", "Simple pricing"), { ...section("b", undefined), children: [section("c", "team")] }, section("d", "prices")];
    expect(sectionAnchors(tree)).toEqual([
      { anchor: "prices", title: "Simple pricing", blockId: "a" },
      { anchor: "team", title: "", blockId: "c" },
    ]);
  });

  it("is carried by the section as its id, clear of a sticky header", () => {
    const src = readFileSync("src/components/blocks/Section.tsx", "utf8");
    expect(src).toContain("id={anchor ? anchorId(anchor) : undefined}");
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/\.nvx-anchor \{ scroll-margin-top: 6rem; \}/);
  });

  it("is reached smoothly on a published page, unless the visitor has asked for less motion", () => {
    // And only on a page with a named section to be reached.
    expect(siteThemeCss({})).toContain("@media (prefers-reduced-motion: no-preference) { :root:has(.nvx-anchor) { scroll-behavior: smooth; } }");
    expect(siteThemeCss({}, ".public-canvas")).not.toContain("scroll-behavior");
  });
});

describe("a block's scroll-in motion", () => {
  it("is one the page knows how to draw, or nothing", () => {
    expect(normalizeMotion("rise")).toBe("rise");
    expect(normalizeMotion("spin")).toBeUndefined();
    const result = normalizeBlockTree([
      { id: "a", type: "text", props: { text: "Hi" }, motion: "fade" },
      { id: "b", type: "text", props: { text: "Hi" }, motion: "wobble" },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].motion).toBe("fade");
    expect(result.tree[1]).not.toHaveProperty("motion");
  });

  it("plays only where a browser can drive it from scrolling and the visitor has not asked for less motion", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = css.slice(css.indexOf("@supports (animation-timeline: view())"));
    expect(rule).toMatch(/^@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{\s*\.nvx-reveal \{/);
    // Finished once the block is in view or 14rem into it, whichever is first.
    expect(rule).toContain("animation-range: entry 0% entry min(100%, 14rem);");
  });

  it("is drawn on the published page and not while editing", () => {
    expect(readFileSync("src/components/blocks/LayerFrame.tsx", "utf8")).toContain("<BlockMotionFrame motion={block.motion}>");
    expect(readFileSync("src/components/blocks/Sortable.tsx", "utf8")).not.toContain("BlockMotionFrame");
  });
});
