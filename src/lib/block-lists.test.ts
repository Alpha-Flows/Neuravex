import { describe, it, expect } from "vitest";
import { normalizeBlockTree } from "@/lib/block-tree";

/** The one block's props after the validator has read them. */
function props(type: string, raw: Record<string, unknown>) {
  const result = normalizeBlockTree([{ id: "b", type, props: raw }]);
  if (!result.ok) throw new Error(result.error);
  return result.tree[0].props;
}

const plan = (name: string) => ({ name, price: "€1", features: [], buttonHref: "#" });

describe("a list a block keeps", () => {
  it("counts the entries it keeps against the cap, not the ones it reads", () => {
    // Four broken plans used to use up a cap of four, and the good plan after
    // them was never looked at.
    const plans = props("pricing", { plans: [1, "x", null, [], plan("Pro")] }).plans;
    expect(plans.map((p: { name: string }) => p.name)).toEqual(["Pro"]);
  });

  it("still stops at the cap", () => {
    const plans = props("pricing", { plans: Array.from({ length: 9 }, (_, i) => plan(`P${i}`)) }).plans;
    expect(plans).toHaveLength(4);
    expect(plans[0].name).toBe("P0");
  });

  it("does not read without end looking for good entries", () => {
    // Two thousand junk entries, then one good plan: the good one is past how
    // far the validator will look, and the page is saved without it rather
    // than every entry being parsed to find it.
    const plans = props("pricing", { plans: [...Array.from({ length: 2000 }, () => 0), plan("Late")] }).plans;
    expect(plans).toEqual([]);
  });

  it("empties a list that is not a list", () => {
    expect(props("gallery", { images: "nope" }).images).toEqual([]);
    expect(props("social", { links: { 0: { network: "x", href: "#" } } }).links).toEqual([]);
  });
});

describe("a block's id", () => {
  it("is unique in a tree even when what was saved was not", () => {
    const result = normalizeBlockTree([
      { id: "pricing", type: "spacer", props: {} },
      { id: "s", type: "section", props: {}, children: [{ id: "pricing", type: "spacer", props: {} }] },
      { id: "pricing", type: "spacer", props: {} },
    ]);
    if (!result.ok) throw new Error(result.error);
    const ids = [result.tree[0].id, result.tree[1].children![0].id, result.tree[2].id];
    expect(ids[0]).toBe("pricing");
    expect(new Set(ids).size).toBe(3);
  });

  it("is kept as it was when it is already unique", () => {
    const result = normalizeBlockTree([{ id: "a", type: "spacer", props: {} }, { id: "b", type: "spacer", props: {} }]);
    expect(result.ok && result.tree.map((b) => b.id)).toEqual(["a", "b"]);
  });
});

describe("words drawn inside a block's own link", () => {
  it("lose any link of their own, and keep the words", () => {
    const label = props("button", { label: 'Talk to <a href="https://x.example">sales</a> <b>today</b>' }).label;
    expect(label).toBe("Talk to sales <b>today</b>");
  });
});
