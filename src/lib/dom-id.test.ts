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
    expect(id).toBe("nvx-a_20_b_22_c_27_d_23_e_3c_f_3e_g_2f_h_3f_i-slide-1");
    expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
  });

  it("still makes an id when the block has none", () => {
    expect(domId("", "photo", 0)).toBe("nvx-_-photo-0");
    expect(domId(undefined)).toBe("nvx-_");
  });

  it("makes one for a block with no id that no named block can share", () => {
    expect(domId("", "photo", 0)).not.toBe(domId("block", "photo", 0));
    expect(domId("")).not.toBe(domId("_"));
  });

  it("gives two blocks two different ids", () => {
    expect(domId("one", "photo", 0)).not.toBe(domId("two", "photo", 0));
  });

  it("gives two different ids that only differ in what cannot be written two different ids", () => {
    // Dropping the characters made `q"><x` and `q<x` the same block.
    expect(domId('q"><x')).not.toBe(domId("q<x"));
    expect(domId("a_20_b")).not.toBe(domId("a b"));
    expect(domId("a-b")).not.toBe(domId("a_b"));
  });

  it("cannot be made to match another block's id by putting a separator in its own", () => {
    // `a`'s first picture and the whole of a block called `a-photo-1`.
    expect(domId("a", "photo", 1)).not.toBe(domId("a-photo-1"));
  });
});
