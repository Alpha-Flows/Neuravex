import { describe, it, expect } from "vitest";
import { withPicture } from "@/lib/media-item";

describe("choosing a picture for a gallery tile or a slide", () => {
  it("takes the file's size and the library's description", () => {
    const item = withPicture(undefined, "/stock/a.jpg", { naturalWidth: 800, naturalHeight: 600, alt: "A lake" });
    expect(item).toMatchObject({ src: "/stock/a.jpg", naturalWidth: 800, naturalHeight: 600, alt: "A lake", altFromLibrary: true });
  });

  it("replaces a description that came from the library", () => {
    // It described the picture being swapped out.
    const before = { src: "/stock/a.jpg", alt: "A lake", altFromLibrary: true };
    const after = withPicture(before, "/stock/b.jpg", { alt: "A forest" });
    expect(after.alt).toBe("A forest");
    expect(after.altFromLibrary).toBe(true);
  });

  it("never overwrites words somebody wrote", () => {
    const before = { src: "/stock/a.jpg", alt: "Our shop at dawn", altFromLibrary: false };
    const after = withPicture(before, "/stock/b.jpg", { alt: "A forest", naturalWidth: 10, naturalHeight: 5 });
    expect(after.alt).toBe("Our shop at dawn");
    expect(after.altFromLibrary).toBe(false);
    expect(after.src).toBe("/stock/b.jpg");
    expect(after.naturalWidth).toBe(10);
  });

  it("forgets the old size when the new picture's is not known", () => {
    const before = { src: "/stock/a.jpg", alt: "", naturalWidth: 800, naturalHeight: 600 };
    const after = withPicture(before, "https://example.com/x.jpg");
    expect(after.naturalWidth).toBeUndefined();
    expect(after.naturalHeight).toBeUndefined();
    expect(after.alt).toBe("");
    expect(after.altFromLibrary).toBe(false);
  });

  it("keeps the caption", () => {
    const after = withPicture({ src: "/a.jpg", alt: "", caption: "Opening night" }, "/b.jpg");
    expect(after.caption).toBe("Opening night");
  });
});
