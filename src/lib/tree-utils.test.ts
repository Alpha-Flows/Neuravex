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
  groupIntoColumns,
  flattenColumns,
  columnCount,
  clampColumn,
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

  it("stamps every child's column once a column is touched", () => {
    const blocks = [b("col", "columns", { count: 2 }, [b("a"), b("b")])];
    const result = updateContainer(blocks, "col-col-0", (list) => list);
    expect(result[0].children!.map((c) => [c.id, c.column])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("keeps explicit placement when another column is edited", () => {
    const blocks = [b("col", "columns", { count: 3 }, [
      { ...b("a"), column: 0 },
      { ...b("b"), column: 2 },
    ])];
    const result = updateContainer(blocks, "col-col-0", (list) => [...list, b("new")]);
    expect(result[0].children!.map((c) => [c.id, c.column])).toEqual([
      ["a", 0],
      ["new", 0],
      ["b", 2],
    ]);
  });

  it("reaches a container nested inside a column", () => {
    // A section living in a column is not one of the column's own containers,
    // so the walk has to keep going rather than stopping at the columns block.
    const blocks = [b("col", "columns", { count: 2 }, [
      b("sec", "section", {}, [b("x"), b("y")]),
    ])];
    const result = updateContainer(blocks, "section-sec", (list) => list.reverse());
    expect(result[0].children![0].children!.map((c) => c.id)).toEqual(["y", "x"]);
  });
});

describe("moving a block between columns", () => {
  it("carries the new column through remove + insert", () => {
    const blocks = [b("col", "columns", { count: 3 }, [b("a"), b("b"), b("c")])];
    let moved: BaseBlock | undefined;
    const removed = removeFromContainer(blocks, "col-col-2", "c", (x) => (moved = x));
    expect(moved?.id).toBe("c");
    const result = insertIntoContainer(removed, "col-col-0", moved!, undefined);
    expect(result[0].children!.map((x) => [x.id, x.column])).toEqual([
      ["a", 0],
      ["c", 0],
      ["b", 1],
    ]);
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

describe("groupIntoColumns — legacy content (no explicit column)", () => {
  it("distributes 6 items into 3 equal columns", () => {
    const blocks = [b("a"), b("b"), b("c"), b("d"), b("e"), b("f")];
    const cols = groupIntoColumns(blocks, 3);
    expect(cols.map((c) => c.map((x) => x.id))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("handles uneven distribution (7 items, 3 cols)", () => {
    const blocks = [b("a"), b("b"), b("c"), b("d"), b("e"), b("f"), b("g")];
    const cols = groupIntoColumns(blocks, 3);
    // ceil(7/3)=3 per col: col1=[a,b,c], col2=[d,e,f], col3=[g]
    expect(cols.map((c) => c.map((x) => x.id))).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g"],
    ]);
  });

  it("handles empty array", () => {
    const cols = groupIntoColumns([], 3);
    expect(cols).toEqual([[], [], []]);
  });

  it("handles fewer items than columns", () => {
    const blocks = [b("a")];
    const cols = groupIntoColumns(blocks, 3);
    expect(cols.map((c) => c.map((x) => x.id))).toEqual([["a"], [], []]);
  });
});

describe("groupIntoColumns — explicit placement", () => {
  const withColumn = (id: string, column: number): BaseBlock => ({ ...b(id), column });

  it("honours each child's own column", () => {
    const blocks = [withColumn("a", 2), withColumn("b", 0), withColumn("c", 2)];
    expect(groupIntoColumns(blocks, 3).map((c) => c.map((x) => x.id))).toEqual([
      ["b"],
      [],
      ["a", "c"],
    ]);
  });

  it("keeps placement stable when a block is added", () => {
    // The legacy split moved existing cards around when the count changed:
    // 4 children across 3 columns became [2, 2, 0]. Explicit columns don't.
    const blocks = [withColumn("a", 0), withColumn("b", 1), withColumn("c", 2), withColumn("d", 0)];
    expect(groupIntoColumns(blocks, 3).map((c) => c.map((x) => x.id))).toEqual([
      ["a", "d"],
      ["b"],
      ["c"],
    ]);
  });

  it("clamps a column beyond the current count", () => {
    // Dropping a 4-column block to 2 columns must not lose children.
    const blocks = [withColumn("a", 3), withColumn("b", 0)];
    expect(groupIntoColumns(blocks, 2).map((c) => c.map((x) => x.id))).toEqual([["b"], ["a"]]);
  });

  it("puts an unplaced child first when its siblings are placed", () => {
    const blocks = [withColumn("a", 1), b("stray")];
    expect(groupIntoColumns(blocks, 2).map((c) => c.map((x) => x.id))).toEqual([["stray"], ["a"]]);
  });
});

describe("flattenColumns", () => {
  it("stamps each child with the column it now lives in", () => {
    const flat = flattenColumns([[b("a")], [b("b"), b("c")]]);
    expect(flat.map((x) => [x.id, x.column])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 1],
    ]);
  });

  it("round-trips through groupIntoColumns unchanged", () => {
    const buckets = [[b("a"), b("d")], [b("b")], [b("c")]];
    const flat = flattenColumns(buckets);
    expect(groupIntoColumns(flat, 3).map((c) => c.map((x) => x.id))).toEqual([
      ["a", "d"],
      ["b"],
      ["c"],
    ]);
  });

  it("converts legacy content without moving anything on screen", () => {
    const legacy = [b("a"), b("b"), b("c"), b("d")];
    const before = groupIntoColumns(legacy, 3).map((c) => c.map((x) => x.id));
    const after = groupIntoColumns(flattenColumns(groupIntoColumns(legacy, 3)), 3).map((c) =>
      c.map((x) => x.id),
    );
    expect(after).toEqual(before);
  });

  it("leaves an already-correct child untouched", () => {
    const placed: BaseBlock = { ...b("a"), column: 1 };
    const flat = flattenColumns([[], [placed]]);
    expect(flat[0]).toBe(placed);
  });
});

describe("columnCount / clampColumn", () => {
  it("reads the count off the block, defaulting to 2", () => {
    expect(columnCount({ id: "x", type: "columns", props: { count: 3 } })).toBe(3);
    expect(columnCount({ id: "x", type: "columns", props: {} })).toBe(2);
    expect(columnCount({ id: "x", type: "columns", props: { count: "nope" } })).toBe(2);
  });

  it("clamps the count to what we can render", () => {
    expect(columnCount({ id: "x", type: "columns", props: { count: 99 } })).toBe(4);
    expect(columnCount({ id: "x", type: "columns", props: { count: 0 } })).toBe(1);
  });

  it("clamps a column index into range", () => {
    expect(clampColumn(-3, 3)).toBe(0);
    expect(clampColumn(7, 3)).toBe(2);
    expect(clampColumn(Number.NaN, 3)).toBe(0);
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
