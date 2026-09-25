import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import type { BaseBlock } from "@/types";
import {
  baseOf,
  basesOf,
  canonicalOf,
  normalizeSyncedId,
  placeCopy,
  replaceCopies,
  syncCopiesOnPage,
  syncedCopies,
} from "@/lib/synced-blocks";
import { normalizeBlockTree } from "@/lib/block-tree";

const banner = (id: string, words: string, extra: Partial<BaseBlock> = {}): BaseBlock => ({
  id,
  type: "section",
  synced: "sb1",
  props: { background: "#0f172a", paddingY: 48, paddingX: 24, maxWidth: "site", align: "left" },
  children: [{ id: `${id}-t`, type: "text", props: { text: words, align: "left", size: "base", color: "" } }],
  ...extra,
});

describe("a synced copy", () => {
  it("is the same as another whatever their ids and places on the page", () => {
    const a = banner("a", "Open daily", { layer: { mode: "flow", level: 2 } });
    const b = banner("b", "Open daily", { column: 1 });
    expect(canonicalOf(a)).toBe(canonicalOf(b));
    expect(baseOf(a)).toBe(baseOf(b));
    expect(baseOf(banner("c", "Closed Mondays"))).not.toBe(baseOf(a));
  });

  it("takes the content given while keeping its own id, depth and column, and new ids inside", () => {
    const copy = banner("a", "Old", { layer: { mode: "flow", level: 1 }, column: 2 });
    const placed = placeCopy(copy, banner("z", "New"));
    expect(placed.id).toBe("a");
    expect(placed.layer).toEqual({ mode: "flow", level: 1 });
    expect(placed.column).toBe(2);
    expect(placed.synced).toBe("sb1");
    expect(placed.children?.[0].props.text).toBe("New");
    expect(placed.children?.[0].id).not.toBe("z-t");
  });

  it("is found outermost only, and every copy of one block replaced at once", () => {
    const tree = [banner("a", "Old"), { id: "s", type: "section", props: {}, children: [banner("b", "Old")] } as BaseBlock];
    expect(syncedCopies(tree).map((b) => b.id)).toEqual(["a", "b"]);
    const { tree: next, changed } = replaceCopies(tree, "sb1", banner("x", "New"));
    expect(changed).toBe(true);
    expect(syncedCopies(next).map((b) => b.children?.[0].props.text)).toEqual(["New", "New"]);
    expect(replaceCopies(next, "sb1", banner("x", "New")).changed).toBe(false);
  });

  it("placed twice on one page is edited as one", () => {
    const before = [banner("a", "Old"), banner("b", "Old")];
    const after = [banner("a", "Edited"), banner("b", "Old")];
    const synced = syncCopiesOnPage(before, after);
    expect(synced.map((b) => b.children?.[0].props.text)).toEqual(["Edited", "Edited"]);
    // Nothing changed, nothing touched.
    expect(syncCopiesOnPage(before, before)).toBe(before);
  });

  it("reports the version each synced block is at, for the save to compare", () => {
    expect(basesOf([banner("a", "Old"), { ...banner("c", "Other"), synced: "sb2" }])).toEqual({
      sb1: baseOf(banner("a", "Old")),
      sb2: baseOf(banner("c", "Other")),
    });
  });

  it("keeps its marker through the validator, when it is an id", () => {
    expect(normalizeSyncedId("clx9abc")).toBe("clx9abc");
    expect(normalizeSyncedId('x" onload="1')).toBeUndefined();
    const result = normalizeBlockTree([banner("a", "Hi"), { ...banner("b", "Hi"), synced: "<script>" }]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].synced).toBe("sb1");
    expect(result.tree[1]).not.toHaveProperty("synced");
  });

  it("is settled by the save route, which is told the version the editor started from", () => {
    const route = readFileSync("src/app/api/pages/[id]/save/route.ts", "utf8");
    expect(route).toContain("synced = await settleSyncedBlocks(page.id, tree.tree, bases);");
    const editor = readFileSync("src/components/editor/PageEditor.tsx", "utf8");
    expect(editor).toContain("syncedBase: syncedBaseRef.current,");
    expect(editor).toContain("syncCopiesOnPage(");
  });
});
