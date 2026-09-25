import { describe, it, expect } from "vitest";
import { domId } from "@/lib/dom-id";

describe("an id made from a block's id", () => {
  it("joins the parts behind a prefix", () => {
    expect(domId("b1x9", "photo", 3)).toBe("nvx-b1x9-photo-3");
    expect(domId("b1x9")).toBe("nvx-b1x9");
  });

  it("keeps nothing that would break a fragment or an attribute", () => {
    // An imported block's id is any string up to 128 characters. A space, a
    // quote or a `#` in it would end `href="#…"` early or point somewhere else.
    const id = domId(`a b"c'd#e<f>g/h?i`, "slide", 1);
    expect(id).toBe("nvx-abcdefghi-slide-1");
    expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
  });

  it("still makes an id when nothing usable is left", () => {
    expect(domId("###", "photo", 0)).toBe("nvx-block-photo-0");
    expect(domId(undefined)).toBe("nvx-block");
  });

  it("gives two blocks two different ids", () => {
    expect(domId("one", "photo", 0)).not.toBe(domId("two", "photo", 0));
  });
});
