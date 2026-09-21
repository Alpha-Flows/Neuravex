import { describe, it, expect } from "vitest";
import type { BaseBlock } from "@/types";
import {
  FLOAT_START,
  MAX_LEVEL,
  MIN_LEVEL,
  clampLevel,
  clampOffset,
  clampWidth,
  floatsOnly,
  isFloating,
  layerBoxes,
  layerOf,
  levelRange,
  normalizeLayer,
  withLayer,
} from "@/lib/block-layer";
import { normalizeBlockTree } from "@/lib/block-tree";

const block = (layer?: unknown): BaseBlock =>
  ({ id: "b", type: "text", props: { text: "hi" }, ...(layer === undefined ? {} : { layer }) }) as BaseBlock;

describe("a block with nothing said about its depth", () => {
  it("is in the flow at level 0", () => {
    expect(layerOf(block())).toMatchObject({ mode: "flow", level: 0 });
    expect(isFloating(block())).toBe(false);
  });

  it("is drawn exactly as it was before depth existed — no wrapper, no style", () => {
    // The whole point: every page already written keeps the layout it has.
    expect(layerBoxes(block())).toEqual({ outer: null, inner: {} });
  });

  it("is not given a layer to store", () => {
    expect(normalizeLayer(undefined)).toBeUndefined();
    expect(normalizeLayer({ mode: "flow", level: 0 })).toBeUndefined();
    expect(normalizeLayer("float")).toBeUndefined();
  });
});

describe("a block in the flow at another level", () => {
  it("gets a z-index, and the position that makes one mean anything", () => {
    expect(layerBoxes(block({ mode: "flow", level: 3 }))).toEqual({
      outer: null,
      inner: { position: "relative", zIndex: 3 },
    });
  });

  it("can be sent behind its neighbours", () => {
    expect(layerBoxes(block({ mode: "flow", level: -2 })).inner).toMatchObject({ zIndex: -2 });
  });
});

describe("a floating block", () => {
  const floated = block({ mode: "float", level: 2, x: 20, y: 30, width: 40 });

  it("is placed by a wrapper that spans its area, and offset inside it", () => {
    // Two elements rather than one: the wrapper is what makes `top` a share of
    // the stack's height, and `marginLeft` a share of the content column
    // rather than of the whole window.
    expect(layerBoxes(floated)).toEqual({
      outer: { position: "absolute", top: "30%", left: 0, right: 0, zIndex: 2 },
      inner: { marginLeft: "20%", width: "40%" },
    });
  });

  it("starts somewhere visible when a block is first floated", () => {
    const next = withLayer(block(), { mode: "float" });
    expect(next.layer).toEqual({ mode: "float", level: 0, ...FLOAT_START });
  });

  it("keeps its level when it is put back in the flow, and loses its placement", () => {
    expect(withLayer(floated, { mode: "flow" }).layer).toEqual({ mode: "flow", level: 2 });
  });

  it("carries no layer at all once it is back in the flow at level 0", () => {
    const back = withLayer(block({ mode: "float", level: 0, x: 5, y: 5, width: 50 }), { mode: "flow" });
    expect(back.layer).toBeUndefined();
    expect("layer" in back).toBe(false);
  });
});

describe("values that would be written straight into an inline style", () => {
  it("clamps a level to a range a person can reason about", () => {
    expect(clampLevel(1e12)).toBe(MAX_LEVEL);
    expect(clampLevel(-1e12)).toBe(MIN_LEVEL);
    expect(clampLevel(2.7)).toBe(2);
    expect(clampLevel("3")).toBe(0);
    expect(clampLevel(NaN)).toBe(0);
  });

  it("clamps an offset and rounds it to a tenth of a percent", () => {
    expect(clampOffset(33.333)).toBe(33.3);
    expect(clampOffset(9999)).toBe(200);
    expect(clampOffset(-9999)).toBe(-100);
    expect(clampOffset("left")).toBe(0);
  });

  it("never lets a width reach zero, where a block would be unclickable", () => {
    expect(clampWidth(0)).toBe(2);
    expect(clampWidth(undefined)).toBe(FLOAT_START.width);
    expect(clampWidth(1e9)).toBe(200);
  });

  it("repairs a float whose numbers are nonsense rather than dropping the block", () => {
    expect(normalizeLayer({ mode: "float", level: Infinity, x: null, y: "20", width: {} })).toEqual({
      mode: "float",
      level: 0,
      x: FLOAT_START.x,
      y: FLOAT_START.y,
      width: FLOAT_START.width,
    });
  });
});

describe("a container of blocks", () => {
  it("knows how far forward and back its blocks reach", () => {
    expect(levelRange([block({ mode: "flow", level: 4 }), block({ mode: "flow", level: -1 }), block()])).toEqual({
      min: -1,
      max: 4,
    });
  });

  it("answers 0 either way when nothing has been moved", () => {
    expect(levelRange([])).toEqual({ min: 0, max: 0 });
  });

  it("notices when everything in it floats, so it can be given a height to stand in", () => {
    const float = block({ mode: "float" });
    expect(floatsOnly([float, float])).toBe(true);
    expect(floatsOnly([float, block()])).toBe(false);
    expect(floatsOnly([])).toBe(false);
  });
});

describe("depth on the way into the database", () => {
  it("survives a save", () => {
    const result = normalizeBlockTree([
      { id: "a", type: "image", props: {}, layer: { mode: "float", level: 3, x: 12, y: 40, width: 60 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree[0].layer).toEqual({ mode: "float", level: 3, x: 12, y: 40, width: 60 });
    }
  });

  it("is clamped at the door, wherever the page came from", () => {
    // An import, a paste or the MCP server could otherwise put `zIndex: 1e12`
    // on a block, which lifts it over the builder's own chrome.
    const result = normalizeBlockTree([
      { id: "a", type: "text", props: {}, layer: { mode: "float", level: 2 ** 40, x: 1e9, y: -1e9, width: 0 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree[0].layer).toEqual({ mode: "float", level: MAX_LEVEL, x: 200, y: -100, width: 2 });
    }
  });

  it("leaves a block that says nothing about depth exactly as it was", () => {
    const result = normalizeBlockTree([{ id: "a", type: "text", props: { text: "hi" } }]);
    if (result.ok) expect("layer" in result.tree[0]).toBe(false);
  });

  it("ignores a layer that is not an object", () => {
    const result = normalizeBlockTree([{ id: "a", type: "text", props: {}, layer: ["float"] }]);
    if (result.ok) expect(result.tree[0].layer).toBeUndefined();
  });

  it("carries depth through a nested block too", () => {
    const result = normalizeBlockTree([
      {
        id: "s",
        type: "section",
        props: {},
        children: [{ id: "h", type: "heading", props: {}, layer: { mode: "float", x: 10, y: 20, width: 70 } }],
      },
    ]);
    if (result.ok) expect(result.tree[0].children?.[0].layer).toMatchObject({ mode: "float", x: 10, y: 20 });
  });
});
