import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeInlineHtml } from "@/lib/sanitize";
import { sanitizeClassAttribute } from "@/lib/css-safety";
import { normalizeBlockTree } from "@/lib/block-tree";

/** The one block's props after the validator has read them. */
function props(type: string, raw: Record<string, unknown>) {
  const result = normalizeBlockTree([{ id: "b", type, props: raw }]);
  if (!result.ok) throw new Error(result.error);
  return result.tree[0].props;
}

describe("a class that would lift content off the page", () => {
  it("is dropped from text and from custom HTML", () => {
    // The same sheet `position:fixed;inset:0` in a style attribute was
    // stopped from drawing, one attribute over.
    const sheet = '<span class="fixed inset-0 z-50 bg-white">x</span>';
    expect(sanitizeInlineHtml(sheet)).toBe('<span class="bg-white">x</span>');
    expect(sanitizeHtml(`<div class="fixed inset-0 z-50 bg-white">x</div>`)).toBe('<div class="bg-white">x</div>');
  });

  it("is judged by the utility behind its variants", () => {
    expect(sanitizeClassAttribute("md:fixed hover:!inset-0 -top-4 [&:hover]:absolute sm:z-[999]")).toBe("");
    expect(sanitizeClassAttribute("[position:fixed] [inset:0] pointer-events-none select-none")).toBe("");
    expect(sanitizeClassAttribute("translate-x-full rotate-45 scale-150 transform mix-blend-difference isolate")).toBe("");
  });

  it("cannot borrow the app's own component classes", () => {
    expect(sanitizeClassAttribute("nvx-gallery-lightbox editor-block nvx-block-chrome")).toBe("");
  });

  it("keeps everything that only styles the text", () => {
    const kept = "font-bold text-indigo-600 md:text-lg px-4 rounded-xl anim-float-slow relative";
    expect(sanitizeClassAttribute(kept)).toBe(kept);
  });

  it("leaves no empty class attribute behind", () => {
    expect(sanitizeInlineHtml('<span class="fixed">x</span>')).toBe("<span>x</span>");
  });
});

describe("sanitising what was already sanitised", () => {
  it("does not prefix an in-page link or an id a second time", () => {
    const once = sanitizeInlineHtml('<a href="#top">Back up</a>');
    expect(once).toBe('<a href="#c-top">Back up</a>');
    expect(sanitizeInlineHtml(once)).toBe(once);
    const html = sanitizeHtml('<h2 id="team">Team</h2><a href="#team">Team</a>');
    expect(sanitizeHtml(html)).toBe(html);
    expect(html).toContain('id="c-team"');
  });

  it("gives the same text back however many times a page is saved", () => {
    const body = "x&y<br>".repeat(3000);
    const first = props("accordion", { items: [{ title: "Q", body }] }).items[0].body;
    const second = props("accordion", { items: [{ title: "Q", body: first }] }).items[0].body;
    expect(second).toBe(first);
    expect(first.length).toBeLessThanOrEqual(20_000);
  });

  it("holds the limit on what is stored, and never cuts an entity or a tag in two", () => {
    const text = props("text", { text: "&".repeat(100_000) }).text as string;
    expect(text.length).toBeLessThanOrEqual(100_000);
    expect(text).toMatch(/^(?:&amp;)+$/);
    const tagged = props("table", { rows: [["<b>" + "a".repeat(4995) + "</b>&&&&"]] }).rows[0][0] as string;
    expect(tagged.length).toBeLessThanOrEqual(5000);
    expect(tagged).not.toMatch(/&[a-z]*$/);
    expect(sanitizeInlineHtml(tagged)).toBe(tagged);
  });

  it("leaves short text exactly as it was", () => {
    expect(props("text", { text: "Fish &amp; chips" }).text).toBe("Fish &amp; chips");
  });
});
