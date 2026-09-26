import { describe, it, expect } from "vitest";
import type { BaseBlock } from "@/types";
import { findBlock } from "@/lib/tree-utils";
import {
  moveInList,
  moveManyTo,
  moveWithinContainer,
  parentsOf,
  removeMany,
  selectionInOrder,
  sharedContainer,
  wrapInSection,
} from "@/lib/multi-select";

/**
 * Several blocks at once, and one block a place at a time.
 *
 * The promise these keep is that a page never ends up half-moved: every move
 * returns a whole tree holding every block it was given, or null — never a
 * tree with a block quietly missing, which `insertIntoContainer` would have
 * produced for a container it could not find.
 */

const page = (): BaseBlock[] =>
  [
    { id: "h", type: "heading", props: { text: "Welcome" } },
    { id: "p", type: "text", props: { text: "Hello" } },
    {
      id: "s1",
      type: "section",
      props: {},
      children: [
        { id: "a", type: "text", props: { text: "A" } },
        { id: "b", type: "text", props: { text: "B" } },
      ],
    },
    {
      id: "cols",
      type: "columns",
      props: { count: 2 },
      children: [
        { id: "l", type: "text", props: {}, column: 0 },
        { id: "r", type: "text", props: {}, column: 1 },
      ],
    },
    { id: "empty", type: "section", props: {} },
    { id: "btn", type: "button", props: { label: "Go" } },
  ] as unknown as BaseBlock[];

const topIds = (tree: BaseBlock[]) => tree.map((b) => b.id);
const every = (tree: BaseBlock[]) => [...parentsOf(tree).keys()].sort();

describe("the containers blocks are in", () => {
  it("names each block's container the way the editor does", () => {
    const parents = parentsOf(page());
    expect(parents.get("h")).toBe("page");
    expect(parents.get("a")).toBe("section-s1");
    expect(parents.get("l")).toBe("col-cols-0");
    expect(parents.get("r")).toBe("col-cols-1");
  });
});

describe("the selection as it is acted on", () => {
  it("is in page order, whatever order the blocks were clicked in", () => {
    expect(selectionInOrder(page(), ["btn", "a", "h"])).toEqual(["h", "a", "btn"]);
  });

  it("leaves out a block whose section is chosen too, since moving the section moves it", () => {
    expect(selectionInOrder(page(), ["a", "s1", "p"])).toEqual(["p", "s1"]);
  });

  it("drops ids that are not on the page", () => {
    expect(selectionInOrder(page(), ["gone", "p"])).toEqual(["p"]);
  });
});

describe("deleting several blocks", () => {
  it("takes out every one, wherever it is", () => {
    const tree = removeMany(page(), ["p", "b", "r"]);
    expect(findBlock(tree, "p")).toBeFalsy();
    expect(findBlock(tree, "b")).toBeFalsy();
    expect(findBlock(tree, "r")).toBeFalsy();
    expect(findBlock(tree, "a")).toBeTruthy();
    expect(findBlock(tree, "l")).toBeTruthy();
  });
});

describe("wrapping blocks in a section", () => {
  const section = { id: "new", type: "section", props: { padding: "md" } } as unknown as BaseBlock;

  it("puts them in it, in page order, where the first of them was", () => {
    const tree = wrapInSection(page(), ["btn", "p", "h"], section)!;
    expect(tree).not.toBeNull();
    // The heading, paragraph and button were on the page; the section takes the heading's place.
    expect(topIds(tree)).toEqual(["new", "s1", "cols", "empty"]);
    expect(tree[0].children!.map((c) => c.id)).toEqual(["h", "p", "btn"]);
    expect(every(tree)).toEqual([...every(page()), "new"].sort());
  });

  it("works inside a section too", () => {
    const tree = wrapInSection(page(), ["a", "b"], section)!;
    const s1 = findBlock(tree, "s1")!;
    expect(s1.children!.map((c) => c.id)).toEqual(["new"]);
    expect(findBlock(tree, "new")!.children!.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps a wrapped column's place in its columns block", () => {
    const tree = wrapInSection(page(), ["r"], section)!;
    const wrapper = findBlock(tree, "new")!;
    expect(wrapper.column).toBe(1);
    expect(wrapper.children![0].column).toBeUndefined();
  });

  it("refuses blocks in different places, which have no one place for the section", () => {
    expect(sharedContainer(page(), ["p", "a"])).toBeNull();
    expect(wrapInSection(page(), ["p", "a"], section)).toBeNull();
  });
});

describe("moving several blocks", () => {
  it("puts them at the end of the container chosen, in page order", () => {
    const tree = moveManyTo(page(), ["btn", "h"], "section-s1")!;
    expect(findBlock(tree, "s1")!.children!.map((c) => c.id)).toEqual(["a", "b", "h", "btn"]);
    expect(topIds(tree)).toEqual(["p", "s1", "cols", "empty"]);
  });

  it("drops into an empty section, the container most worth dropping into", () => {
    const tree = moveManyTo(page(), ["p", "a"], "section-empty")!;
    expect(findBlock(tree, "empty")!.children!.map((c) => c.id)).toEqual(["p", "a"]);
  });

  it("takes a block's column number off it when it leaves its columns block", () => {
    const tree = moveManyTo(page(), ["l"], "page")!;
    expect(findBlock(tree, "l")!.column).toBeUndefined();
  });

  it("refuses to move a section into itself or into a block inside it", () => {
    expect(moveManyTo(page(), ["s1", "p"], "section-s1")).toBeNull();
    const nested = page();
    (nested[2].children as BaseBlock[]).push({ id: "inner", type: "section", props: {}, children: [{ id: "x", type: "text", props: {} }] } as BaseBlock);
    expect(moveManyTo(nested, ["s1"], "section-inner")).toBeNull();
  });

  it("refuses a container that is not there, rather than returning a tree without the blocks", () => {
    expect(moveManyTo(page(), ["p", "h"], "section-nowhere")).toBeNull();
  });
});

describe("moving one block a place up or down", () => {
  it("swaps it with its neighbour", () => {
    expect(topIds(moveWithinContainer(page(), "p", -1)!)).toEqual(["p", "h", "s1", "cols", "empty", "btn"]);
    expect(topIds(moveWithinContainer(page(), "p", 1)!)).toEqual(["h", "s1", "p", "cols", "empty", "btn"]);
  });

  it("moves inside the container the block is in", () => {
    const tree = moveWithinContainer(page(), "b", -1)!;
    expect(findBlock(tree, "s1")!.children!.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("goes nowhere at either end", () => {
    expect(moveWithinContainer(page(), "h", -1)).toBeNull();
    expect(moveWithinContainer(page(), "btn", 1)).toBeNull();
    expect(moveWithinContainer(page(), "gone", 1)).toBeNull();
  });

  it("steps over a floating block, which takes no room in the list", () => {
    const list = [
      { id: "1", type: "text", props: {} },
      { id: "f", type: "text", props: {}, layer: { mode: "float" } },
      { id: "2", type: "text", props: {} },
    ] as unknown as BaseBlock[];
    expect(moveInList(list, 2, -1)!.map((b) => b.id)).toEqual(["2", "1", "f"]);
    expect(moveInList(list, 0, 1)!.map((b) => b.id)).toEqual(["f", "2", "1"]);
  });

  it("does not move past a float at the end, where there is nothing to pass", () => {
    const list = [
      { id: "1", type: "text", props: {} },
      { id: "f", type: "text", props: {}, layer: { mode: "float" } },
    ] as unknown as BaseBlock[];
    expect(moveInList(list, 0, 1)).toBeNull();
  });
});
