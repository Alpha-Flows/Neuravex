import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { normalizeBlockTree } from "@/lib/block-tree";

/**
 * A saved block is not a note about a block: it is stored markup that a later
 * click drops straight into a page. That makes the route a write path into a
 * block tree, like save, import, paste and the MCP server — and it was the one
 * that never went through the shared validator, guarding instead with an
 * `isBlock()` that asked only whether `id` and `type` were strings.
 *
 * These cover the shape of what a round trip through that store may carry, and
 * that both ends of it — the route on the way in, the picker on the way out —
 * go through the same reading as everything else.
 */

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "src", "app", "api", "saved-blocks", "route.ts"), "utf8");
const picker = readFileSync(join(ROOT, "src", "components", "editor", "SavedBlocks.tsx"), "utf8");

/** What the route stores, and what the picker reads back. */
const roundTrip = (input: unknown) => {
  const checked = normalizeBlockTree([input]);
  if (!checked.ok || checked.tree.length === 0) return null;
  const stored = JSON.stringify(checked.tree[0]);
  const back = normalizeBlockTree([JSON.parse(stored)]);
  return back.ok && back.tree.length > 0 ? back.tree[0] : null;
};

describe("what a saved block is allowed to carry", () => {
  it("keeps an ordinary block through the round trip", () => {
    const block = roundTrip({ id: "b1", type: "heading", props: { text: "Hello", level: 1 } });
    expect(block).toMatchObject({ type: "heading" });
    expect(block?.props).toMatchObject({ text: "Hello" });
  });

  it("strips a javascript: href rather than storing it", () => {
    // `isBlock()` let this through untouched, and the picker then inserted it
    // into a page, which is the one place it becomes a link a visitor clicks.
    const block = roundTrip({
      id: "b1",
      type: "button",
      props: { label: "Click", href: "javascript:alert(1)" },
    });
    expect(block).not.toBeNull();
    expect(JSON.stringify(block)).not.toContain("javascript:");
  });

  it("refuses something that is not a block at all", () => {
    expect(roundTrip("not a block")).toBeNull();
    expect(roundTrip(null)).toBeNull();
    expect(roundTrip({ id: "b1" })).toBeNull();
    expect(roundTrip({ id: "b1", type: "not-a-real-type" })).toBeNull();
  });

  it("refuses a tree deep enough to break the page it lands in", () => {
    let deep: Record<string, unknown> = { id: "leaf", type: "text", props: { text: "x" } };
    for (let i = 0; i < 200; i++) {
      deep = { id: `s${i}`, type: "section", props: {}, children: [deep] };
    }
    const block = roundTrip(deep);
    // Either refused outright or cut back to a depth the renderer survives —
    // what must not happen is 200 levels being stored and inserted.
    const depth = (node: unknown): number => {
      const children = (node as { children?: unknown[] })?.children;
      return Array.isArray(children) && children.length ? 1 + Math.max(...children.map(depth)) : 1;
    };
    if (block) expect(depth(block)).toBeLessThanOrEqual(32);
  });

  it("survives a single block being wrapped for the validator", () => {
    // The row holds one block, and `normalizeBlockTree` takes a list. Passing
    // the row's JSON straight in refuses every saved block ever made, silently.
    const block = { id: "b1", type: "text", props: { text: "hi" } };
    expect(normalizeBlockTree(JSON.stringify(block)).ok).toBe(false);
    expect(normalizeBlockTree([block]).ok).toBe(true);
  });
});

describe("both ends of the store", () => {
  it("validates on the way in, with the shared reading", () => {
    expect(route).toContain("normalizeBlockTree");
    // The import, not the word — the comment above it explains what it used to do.
    expect(route).not.toMatch(/^import .*\bisBlock\b/m);
  });

  it("reads the body with a cap before parsing it", () => {
    expect(route).toContain("readJsonObject");
    expect(route).not.toMatch(/await req\.json\(\)/);
  });

  it("stores the checked block, not the one that was sent", () => {
    // Storing `body.block` after checking a copy of it would validate nothing.
    expect(route).toContain("const block = checked.tree[0]");
    expect(route).toContain("JSON.stringify(block)");
    expect(route).not.toContain("JSON.stringify(body.block)");
  });

  it("validates again on the way out, for rows an older version wrote", () => {
    // The route checks what it stores now. Rows already in a customer's
    // database were never checked, and this is where one becomes part of a
    // page — the same argument `pasteable()` makes about the clipboard.
    expect(picker).toContain("normalizeBlockTree([stored])");
  });
});

describe("the other routes that read a body", () => {
  const capped = [
    ["revisions", join("src", "app", "api", "pages", "[id]", "revisions", "route.ts")],
    ["legal", join("src", "app", "api", "sites", "[id]", "legal", "route.ts")],
  ] as const;

  it("read with a cap instead of letting the body decide the memory used", () => {
    for (const [name, path] of capped) {
      const source = readFileSync(join(ROOT, path), "utf8");
      expect(source, `${name} must not call req.json()`).not.toMatch(/await req\.json\(\)/);
    }
  });

  it("keeps an absent body distinct from an empty one, where that matters", () => {
    // The legal POST generates from what is on file when nothing is sent. An
    // empty object there would overwrite a stored profile with a blank one.
    const legal = readFileSync(join(ROOT, capped[1][1]), "utf8");
    expect(legal).toContain("body: null");
  });
});
