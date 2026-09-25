import { describe, it, expect } from "vitest";
import { cleanFocus, focusAt, focusValue, parseFocus, shapeRatio } from "@/lib/focus-point";
import { backgroundStyle, columnBoxStyle } from "@/lib/block-style";
import { normalizeBlockTree } from "@/lib/block-tree";

describe("a focus point", () => {
  it("is two whole percentages, or nothing when it is the centre", () => {
    expect(cleanFocus("30% 20%")).toBe("30% 20%");
    expect(cleanFocus("30.6% 120%")).toBe("31% 100%");
    expect(cleanFocus("50% 50%")).toBeUndefined();
    expect(focusValue({ x: 50, y: 50 })).toBeUndefined();
    expect(parseFocus(undefined)).toEqual({ x: 50, y: 50 });
  });

  it("cannot carry anything else into a style attribute", () => {
    expect(cleanFocus("30% 20%; background: url(https://tracker.example/x)")).toBeUndefined();
    expect(cleanFocus("left top")).toBeUndefined();
    expect(cleanFocus(42)).toBeUndefined();
  });

  it("is where the picture was clicked", () => {
    expect(focusAt({ left: 100, top: 50, width: 200, height: 100 }, 150, 75)).toEqual({ x: 25, y: 25 });
    expect(focusAt({ left: 0, top: 0, width: 100, height: 100 }, -20, 400)).toEqual({ x: 0, y: 100 });
  });

  it("places a section's picture, and a column's", () => {
    expect(backgroundStyle({ backgroundImage: "/uploads/a.jpg", backgroundFocus: "30% 20%" }).backgroundPosition).toBe("30% 20%");
    expect(backgroundStyle({ backgroundImage: "/uploads/a.jpg", backgroundFocus: "evil;" }).backgroundPosition).toBe("center");
    expect(columnBoxStyle({ backgroundImage: "/uploads/a.jpg", backgroundFocus: "0% 100%" }).backgroundPosition).toBe("0% 100%");
  });

  it("travels with a picture in every block that crops one, and is repaired on the way in", () => {
    const result = normalizeBlockTree([
      { id: "i", type: "image", props: { src: "/uploads/a.jpg", shape: "16/9", focus: "10% 90%" } },
      { id: "j", type: "image", props: { src: "/uploads/a.jpg", shape: "2/1", focus: "x" } },
      { id: "s", type: "section", props: { backgroundImage: "/uploads/b.jpg", backgroundFocus: "70% 30%" }, children: [] },
      { id: "g", type: "gallery", props: { images: [{ src: "/uploads/c.jpg", alt: "", focus: "20% 20%" }] } },
    ]);
    if (!result.ok) throw new Error(result.error);
    const [image, bad, section, gallery] = result.tree;
    expect(image.props).toMatchObject({ shape: "16/9", focus: "10% 90%" });
    expect(bad.props.shape).toBeUndefined();
    expect(bad.props.focus).toBeUndefined();
    expect(section.props.backgroundFocus).toBe("70% 30%");
    expect(gallery.props.images[0].focus).toBe("20% 20%");
  });

  it("names the shapes an image block can be cut to", () => {
    expect(shapeRatio("16/9")).toBe("16 / 9");
    expect(shapeRatio("original")).toBeUndefined();
    expect(shapeRatio("7/1")).toBeUndefined();
  });
});
