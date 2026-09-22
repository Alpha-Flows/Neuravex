import { describe, it, expect } from "vitest";
import type { BaseBlock } from "@/types";
import { containerChoices } from "@/lib/containers";
import { findBlock, insertIntoContainer, removeFromContainer } from "@/lib/tree-utils";

/**
 * The list a floating block is moved by.
 *
 * Every other block changes container by being dragged; a float's drag already
 * means "move it across the page", so `Sortable.tsx` switches its sortable off
 * and this list is the only way out of the container it was made in.
 */

const page = (): BaseBlock[] =>
  [
    {
      id: "s1",
      type: "section",
      props: {},
      children: [
        { id: "h1", type: "heading", props: {} },
        {
          id: "c1",
          type: "columns",
          props: { count: 2 },
          children: [{ id: "t1", type: "text", props: {}, column: 0 }],
        },
      ],
    },
    { id: "s2", type: "section", props: {}, children: [] },
    { id: "img", type: "image", props: {} },
  ] as unknown as BaseBlock[];

const ids = (blocks: BaseBlock[], exclude?: string) => containerChoices(blocks, exclude).map((c) => c.id);
const labels = (blocks: BaseBlock[], exclude?: string) => containerChoices(blocks, exclude).map((c) => c.label);

describe("the containers a block can be moved into", () => {
  it("offers the page, every section and every column", () => {
    expect(ids(page())).toEqual(["page", "section-s1", "col-c1-0", "col-c1-1", "section-s2"]);
  });

  it("uses the ids the rest of the editor already moves blocks by", () => {
    // The point of matching them is that the move is `removeFromContainer` +
    // `insertIntoContainer`, exactly what a drag does — no second code path.
    const blocks = page();
    for (const id of ids(blocks)) {
      if (id === "page") continue;
      let moved: BaseBlock | undefined;
      const removed = removeFromContainer(blocks, "page", "img", (b) => (moved = b));
      const next = insertIntoContainer(removed, id, moved!, undefined);
      expect(findBlock(next, "img"), `${id} should accept a block`).not.toBeNull();
    }
  });

  it("offers a container that is empty, which is where a first block goes", () => {
    expect(ids(page())).toContain("section-s2");
  });

  it("names them the way the palette does, numbered when there is more than one", () => {
    expect(labels(page())).toEqual(["Page", "Section", "Columns · column 1", "Columns · column 2", "Section 2"]);
  });

  it("leaves out the block being moved, and everything inside it", () => {
    // A section dropped into its own descendant takes the rest of the page
    // with it and leaves a tree that cannot be rendered.
    expect(ids(page(), "s1")).toEqual(["page", "section-s2"]);
  });

  it("names a container the same whichever block is asking", () => {
    // The label is a fact about the page, not about the question. Numbering
    // only what survives the exclusion would rename `s2` from "Section 2" to
    // "Section" depending on what was selected.
    expect(labels(page(), "s1")).toContain("Section 2");
  });

  it("indents them so a nested container can be told from a top-level one", () => {
    const byId = new Map(containerChoices(page()).map((c) => [c.id, c.depth]));
    expect(byId.get("page")).toBe(0);
    expect(byId.get("section-s1")).toBe(1);
    expect(byId.get("col-c1-0")).toBeGreaterThan(byId.get("section-s1")!);
  });

  it("survives a page with nothing on it", () => {
    expect(ids([])).toEqual(["page"]);
  });

  it("offers a section the validator has emptied, and that section accepts a block", () => {
    // `normalizeBlockTree` drops an empty `children` array rather than storing
    // it, so a section with nothing in it arrives carrying no array at all.
    // Reading containerhood off that array made the one container a picker is
    // most useful for the one it could not offer.
    const emptied = [
      { id: "s1", type: "section", props: {} },
      { id: "s2", type: "section", props: {}, children: [{ id: "t", type: "text", props: {} }] },
    ] as unknown as BaseBlock[];

    expect(ids(emptied)).toContain("section-s1");

    const next = insertIntoContainer(emptied, "section-s1", { id: "x", type: "text", props: {} } as BaseBlock, undefined);
    expect(findBlock(next, "x")).not.toBeNull();
  });
});

describe("the move itself", () => {
  it("carries the block, and its placement, into the new container", () => {
    const blocks = page();
    const float = { id: "f1", type: "heading", props: {}, layer: { mode: "float", level: 2, x: 20, y: 30, width: 40 } };
    const withFloat = insertIntoContainer(blocks, "section-s1", float as unknown as BaseBlock, undefined);

    let moved: BaseBlock | undefined;
    const removed = removeFromContainer(withFloat, "section-s1", "f1", (b) => (moved = b));
    const next = insertIntoContainer(removed, "section-s2", moved!, undefined);

    const landed = findBlock(next, "f1");
    // The offsets are shares of whatever it floats in, so they survive the
    // move and mean the same thing in the new box.
    expect(landed?.layer).toEqual({ mode: "float", level: 2, x: 20, y: 30, width: 40 });
    expect(findBlock(removed, "f1")).toBeNull();
  });

  it("loses the block when the target names no container — which is why the editor checks", () => {
    // `insertIntoContainer` returns the tree unchanged for an id that matches
    // nothing, and by then the block is already out of its old container. The
    // editor guards on `findBlock` before publishing the result; this is the
    // behaviour that guard exists for.
    const blocks = page();
    let moved: BaseBlock | undefined;
    const removed = removeFromContainer(blocks, "page", "img", (b) => (moved = b));
    const next = insertIntoContainer(removed, "section-does-not-exist", moved!, undefined);
    expect(findBlock(next, "img")).toBeNull();
  });
});
