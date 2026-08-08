import { describe, it, expect } from "vitest";
import {
  mapBlocks,
  findInChildren,
  findBlock,
  cloneTree,
  updateContainer,
  removeFromContainer,
  insertIntoContainer,
  applyOrder,
  resolveDrop,
  distributeLeftToRight,
} from "@/lib/tree-utils";
import { BaseBlock, BlockType } from "@/types";

const b = (id: string, type: BlockType = "heading", props: any = { text: "Hello" }, children?: BaseBlock[]): BaseBlock => ({
  id, type, props, children,
});

describe("findInChildren", () => {
  it("finds a top-level block", () => {
    const blocks = [b("a"), b("b"), b("c")];
    expect(findInChildren(blocks, "b")).toEqual(b("b"));
  });

  it("finds a nested block", () => {
    const blocks = [b("a", "section", {}, [b("nested")])];
    expect(findInChildren(blocks, "nested")).toEqual(b("nested"));
  });

  it("returns null for nonexistent id", () => {
    expect(findInChildren([b("a")], "x")).toBeNull();
  });
});

describe("mapBlocks", () => {
  it("applies fn to all blocks", () => {
    const blocks = [b("a"), b("b")];
    const result = mapBlocks(blocks, (blk) => ({ ...blk, type: "text" as const }));
    expect(result.map((x) => x.type)).toEqual(["text", "text"]);
  });

  it("recurses into children", () => {
    const blocks = [b("a", "section", {}, [b("inner")])];
    const result = mapBlocks(blocks, (blk) => ({ ...blk, type: "heading" as const }));
    expect(result[0].type).toBe("heading");
    expect(result[0].children?.[0].type).toBe("heading");
  });
});

describe("cloneTree", () => {
  it("deep clones", () => {
    const orig = b("a", "section", {}, [b("inner")]);
    const copy = cloneTree(orig);
    copy.children![0].id = "changed";
    expect(orig.children![0].id).toBe("inner");
  });
});

describe("updateContainer", () => {
  it("updates page-level container", () => {
    const blocks = [b("a"), b("b")];
    const result = updateContainer(blocks, "page", (list) => list.reverse());
    expect(result.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("updates section container", () => {
    const blocks = [b("sec", "section", {}, [b("x"), b("y")])];
    const result = updateContainer(blocks, "section-sec", (list) => list.reverse());
    expect(result[0].children?.map((c) => c.id)).toEqual(["y", "x"]);
  });

  it("updates column container", () => {
    const blocks = [b("col", "columns", { count: 3 }, [
      b("a"), b("b"), b("c"), b("d"), b("e"), b("f"),
    ])];
    // 6 items in 3 cols → 2 per col → col1 has [a, b], col2 has [c, d], col3 has [e, f]
    const result = updateContainer(blocks, "col-col-1", (list) => list.reverse());
    // col1 (0-indexed col index 1 = second column) should be [d, c]
    expect(result[0].children!.map((c) => c.id)).toEqual(["a", "b", "d", "c", "e", "f"]);
  });
});

describe("removeFromContainer / insertIntoContainer", () => {
  it("removes from page level", () => {
    const blocks = [b("a"), b("b"), b("c")];
    const result = removeFromContainer(blocks, "page", "b", () => {});
    expect(result.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("inserts at page level", () => {
    const blocks = [b("a"), b("c")];
    const result = insertIntoContainer(blocks, "page", b("b"), 1);
    expect(result.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("inserts at section level", () => {
    const blocks = [b("sec", "section", {}, [b("a"), b("c")])];
    const result = insertIntoContainer(blocks, "section-sec", b("b"), 1);
    expect(result[0].children!.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("applyOrder", () => {
  it("reorders blocks to match new order", () => {
    const blocks = [b("a"), b("b"), b("c")];
    const result = applyOrder(blocks, "page", ["c", "a", "b"]);
    expect(result.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("resolveDrop", () => {
  const buildMaps = (list: BaseBlock[]) => {
    const parentMap = new Map<string, string>();
    const containerMap = new Map<string, BaseBlock[]>();
    parentMap.set("a", "page");
    parentMap.set("b", "page");
    parentMap.set("c", "page");
    containerMap.set("page", list);
    return { parentMap, containerMap };
  };

  it("resolves drop onto a block", () => {
    const blocks = [b("a"), b("b"), b("c")];
    const { parentMap, containerMap } = buildMaps(blocks);
    expect(resolveDrop("b", blocks, parentMap, containerMap)).toEqual({ container: "page", index: 1 });
  });

  it("resolves drop onto drop-end", () => {
    const blocks = [b("a")];
    const { parentMap, containerMap } = buildMaps(blocks);
    expect(resolveDrop("page::drop-end", blocks, parentMap, containerMap)).toEqual({ container: "page", index: null });
  });

  it("returns null for unknown id", () => {
    const { parentMap, containerMap } = buildMaps([]);
    expect(resolveDrop("x", [], parentMap, containerMap)).toEqual({ container: null, index: null });
  });
});

describe("distributeLeftToRight", () => {
  it("distributes 6 items into 3 equal columns", () => {
    const blocks = [b("a"), b("b"), b("c"), b("d"), b("e"), b("f")];
    const cols = distributeLeftToRight(blocks, 3);
    expect(cols.map((c) => c.map((x) => x.id))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("handles uneven distribution (7 items, 3 cols)", () => {
    const blocks = [b("a"), b("b"), b("c"), b("d"), b("e"), b("f"), b("g")];
    const cols = distributeLeftToRight(blocks, 3);
    // ceil(7/3)=3 per col: col1=[a,b,c], col2=[d,e,f], col3=[g]
    expect(cols.map((c) => c.map((x) => x.id))).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g"],
    ]);
  });

  it("handles empty array", () => {
    const cols = distributeLeftToRight([], 3);
    expect(cols).toEqual([[], [], []]);
  });

  it("handles fewer items than columns", () => {
    const blocks = [b("a")];
    const cols = distributeLeftToRight(blocks, 3);
    expect(cols.map((c) => c.map((x) => x.id))).toEqual([["a"], [], []]);
  });
});

describe("insertAfterInTree", () => {
  function insertAfterInTree(list: BaseBlock[], target: string, dup: BaseBlock): BaseBlock[] {
    let inserted = false;
    const out = list.map((blk) => {
      if (inserted) return blk;
      if (blk.id === target) { inserted = true; return [blk, dup]; }
      if (blk.children?.length) {
        const nc = insertAfterInTree(blk.children, target, dup);
        if (nc !== blk.children) { inserted = true; return { ...blk, children: nc }; }
      }
      return blk;
    });
    return inserted ? out.flat() : list;
  }

  it("inserts after target at top level", () => {
    const blocks = [b("a"), b("b"), b("c")];
    const result = insertAfterInTree(blocks, "b", b("b-dup"));
    expect(result.map((x) => x.id)).toEqual(["a", "b", "b-dup", "c"]);
  });

  it("inserts after target in nested children", () => {
    const blocks = [b("sec", "section", {}, [b("a"), b("b")])];
    const result = insertAfterInTree(blocks, "a", b("a-dup"));
    expect(result[0].children!.map((c) => c.id)).toEqual(["a", "a-dup", "b"]);
  });

  it("returns unchanged if target not found", () => {
    const blocks = [b("a")];
    const result = insertAfterInTree(blocks, "x", b("y"));
    expect(result).toEqual(blocks);
  });
});
