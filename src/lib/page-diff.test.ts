import { describe, it, expect } from "vitest";
import type { BaseBlock } from "@/types";
import { blockSummary, diffPages } from "@/lib/page-diff";

/**
 * What changed since a version, in words. Blocks are matched by id, so the
 * tests below keep ids across "before" and "after" the way the editor does.
 */

const heading = (id: string, text: string) => ({ id, type: "heading", props: { text, level: 2 } }) as unknown as BaseBlock;
const text = (id: string, words: string) => ({ id, type: "text", props: { text: `<p>${words}</p>` } }) as unknown as BaseBlock;
const section = (id: string, children: BaseBlock[]) => ({ id, type: "section", props: {}, children }) as unknown as BaseBlock;

const was = () => [heading("h", "Welcome"), text("p", "Open daily"), section("s", [text("a", "First"), text("b", "Second")])];
const diff = (after: BaseBlock[], title = "Home") => diffPages({ title: "Home", blocks: was() }, { title, blocks: after });

describe("what changed since a version", () => {
  it("is nothing for the same page", () => {
    expect(diff(was())).toEqual([]);
  });

  it("names a changed title", () => {
    expect(diff(was(), "Start")).toEqual([{ kind: "title", label: "Title", before: "Home", after: "Start" }]);
  });

  it("reads an edit in place as a change, with the words either way", () => {
    const after = was();
    after[1] = text("p", "Open every day");
    expect(diff(after)).toEqual([{ kind: "changed", label: "Text", before: "Open daily", after: "Open every day" }]);
  });

  it("lists a block added and one taken out", () => {
    const after = was().filter((b) => b.id !== "h");
    after.push(text("new", "Call us"));
    const changes = diff(after);
    expect(changes).toContainEqual({ kind: "added", label: "Text", after: "Call us" });
    expect(changes).toContainEqual({ kind: "removed", label: "Heading", before: "Welcome" });
    expect(changes).toHaveLength(2);
  });

  it("does not list what was inside a section as taken out as well as the section", () => {
    const changes = diff(was().filter((b) => b.id !== "s"));
    expect(changes).toEqual([{ kind: "removed", label: "Section", before: "" }]);
  });

  it("names only the block that moved, not every block it passed", () => {
    const [h, p, s] = was();
    // The heading went to the end; the paragraph and section stayed in order.
    const changes = diff([p, s, h]);
    expect(changes).toEqual([{ kind: "moved", label: "Heading", after: "Welcome" }]);
  });

  it("names a block moved into another container", () => {
    const [h, p, s] = was();
    const moved = { ...s, children: [...s.children!, p] };
    const changes = diff([h, moved]);
    expect(changes).toEqual([{ kind: "moved", label: "Text", after: "Open daily" }]);
  });

  it("names a block that was both changed and moved as both", () => {
    const [h, , s] = was();
    const changes = diff([h, { ...s, children: [text("p", "Closed Mondays"), ...s.children!] }]);
    expect(changes).toEqual([
      { kind: "changed", label: "Text", before: "Open daily", after: "Closed Mondays" },
      { kind: "moved", label: "Text", after: "Closed Mondays" },
    ]);
  });
});

describe("a few words of a block", () => {
  it("is what it says, without its markup", () => {
    expect(blockSummary(text("x", "Fish &amp; <b>chips</b>"))).toBe("Fish & chips");
  });

  it("is cut short when it runs on", () => {
    const summary = blockSummary(text("x", "word ".repeat(40)));
    expect(summary.length).toBeLessThanOrEqual(60);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("is the file for a picture, and a count for a list", () => {
    expect(blockSummary({ id: "i", type: "image", props: { src: "/uploads/2026/shop.jpg" } } as unknown as BaseBlock)).toBe("shop.jpg");
    expect(blockSummary({ id: "g", type: "gallery", props: { images: [{}, {}, {}] } } as unknown as BaseBlock)).toBe("3 images");
  });
});
