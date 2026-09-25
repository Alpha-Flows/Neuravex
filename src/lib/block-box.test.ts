import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { normalizeBlockTree } from "@/lib/block-tree";
import { layerBoxes } from "@/lib/block-layer";
import { boxStyle, normalizeBox, DEFAULT_BORDER_COLOR, SHADOWS } from "@/lib/block-box";

describe("a block's box, as stored", () => {
  it("keeps what draws something and nothing else", () => {
    expect(
      normalizeBox({ paddingY: 24, paddingX: "16", marginTop: 0, borderWidth: 1, borderStyle: "dashed", borderColor: "#e2e8f0", radius: 12, shadow: "md", background: "#ffffff" }),
    ).toEqual({ paddingY: 24, paddingX: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#e2e8f0", radius: 12, shadow: "md", background: "#ffffff" });
  });

  it("is nothing at all when nothing in it draws", () => {
    expect(normalizeBox({ paddingY: 0, shadow: "none", borderStyle: "dotted", borderColor: "red" })).toBeUndefined();
    expect(normalizeBox(undefined)).toBeUndefined();
    expect(normalizeBox("24px")).toBeUndefined();
    expect(normalizeBox([1, 2])).toBeUndefined();
  });

  it("clamps lengths into range and rounds them", () => {
    expect(normalizeBox({ paddingY: 9999, marginBottom: -40, borderWidth: 3.6, radius: 500 })).toEqual({
      paddingY: 200,
      borderWidth: 4,
      radius: 100,
    });
  });

  it("refuses a colour that is not one, and a style or shadow it does not know", () => {
    expect(
      normalizeBox({ borderWidth: 2, borderColor: "red; background:url(//evil.example/x)", borderStyle: "groove", shadow: "huge", background: "javascript:1" }),
    ).toEqual({ borderWidth: 2 });
  });

  it("rides along on a block through the validator, beside its layer", () => {
    const result = normalizeBlockTree([
      { id: "a", type: "text", props: { text: "Hi" }, box: { paddingY: 8, shadow: "sm" }, layer: { level: 2 } },
      { id: "b", type: "text", props: { text: "Plain" }, box: { paddingY: 0 } },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].box).toEqual({ paddingY: 8, shadow: "sm" });
    expect(result.tree[0].layer).toEqual({ mode: "flow", level: 2 });
    expect(result.tree[1]).not.toHaveProperty("box");
  });
});

describe("a block's box, as drawn", () => {
  it("gives a border without a colour of its own the faded text colour", () => {
    expect(boxStyle({ borderWidth: 1 })).toEqual({ borderWidth: 1, borderStyle: "solid", borderColor: DEFAULT_BORDER_COLOR });
  });

  it("pads both sides of each axis and leaves the other margins alone", () => {
    const style = boxStyle({ paddingY: 10, paddingX: 20, marginTop: 30, shadow: "lg" });
    expect(style).toEqual({ paddingTop: 10, paddingBottom: 10, paddingLeft: 20, paddingRight: 20, marginTop: 30, boxShadow: SHADOWS.lg });
    expect(style).not.toHaveProperty("marginLeft");
  });

  it("is never put on the element that places the block", () => {
    // The page's column carries the gutter as padding, and a float is placed
    // by its margin: a frame on either took their place.
    const floating = layerBoxes({ layer: { mode: "float", x: 10, y: 5, width: 40 } }).inner;
    expect(floating).toEqual({ marginLeft: "10%", width: "40%" });
  });

  it("is drawn by the same element on the canvas and on the published page", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    expect(read("src/components/blocks/LayerFrame.tsx")).toContain("<BlockFrame box={block.box}>");
    expect(read("src/components/blocks/Sortable.tsx")).toContain("<BlockFrame box={block.box}>");
  });

  it("draws an absent box exactly as a block was drawn before", () => {
    expect(boxStyle(undefined)).toEqual({});
    expect(layerBoxes({})).toEqual({ outer: null, inner: {} });
  });
});
