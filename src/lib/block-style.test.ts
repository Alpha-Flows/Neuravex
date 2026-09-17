import { describe, it, expect } from "vitest";
import { backgroundStyle, columnBoxStyle, cssUrl } from "@/lib/block-style";

describe("cssUrl", () => {
  it("quotes the URL so brackets in a file name cannot end the declaration", () => {
    expect(cssUrl("/media/hero (1).jpg")).toBe('url("/media/hero (1).jpg")');
  });

  it("escapes quotes and backslashes, and drops newlines", () => {
    expect(cssUrl('/media/a"b.jpg')).toBe('url("/media/a\\"b.jpg")');
    expect(cssUrl("/media/a\nb.jpg")).toBe('url("/media/ab.jpg")');
  });
});

describe("backgroundStyle", () => {
  it("is empty when nothing is set, so the element keeps what it inherits", () => {
    expect(backgroundStyle(undefined)).toEqual({});
    expect(backgroundStyle({})).toEqual({});
    expect(backgroundStyle({ background: "" })).toEqual({});
  });

  it("paints a flat colour when there is no image", () => {
    expect(backgroundStyle({ background: "#101010" })).toEqual({ background: "#101010" });
  });

  it("lets the image win over the colour", () => {
    const style = backgroundStyle({ background: "#101010", backgroundImage: "/a.jpg" });
    expect(style.background).toBeUndefined();
    expect(style.backgroundImage).toBe('url("/a.jpg")');
    expect(style.backgroundSize).toBe("cover");
  });

  it("lays the overlay over the image, not under it", () => {
    const style = backgroundStyle({ backgroundImage: "/a.jpg", backgroundOverlay: "rgba(0,0,0,0.45)" });
    expect(style.backgroundImage).toBe(
      'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("/a.jpg")',
    );
  });

  it("ignores an overlay with no image behind it", () => {
    expect(backgroundStyle({ backgroundOverlay: "rgba(0,0,0,0.45)" })).toEqual({});
  });
});

describe("columnBoxStyle", () => {
  it("is empty for a column that was never styled", () => {
    expect(columnBoxStyle(undefined)).toEqual({});
    expect(columnBoxStyle({})).toEqual({});
  });

  it("adds the inset and rounding on top of the background", () => {
    expect(columnBoxStyle({ backgroundImage: "/a.jpg", padding: 24, radius: 12 })).toMatchObject({
      backgroundImage: 'url("/a.jpg")',
      padding: 24,
      borderRadius: 12,
    });
  });

  it("leaves padding and radius off when they are zero", () => {
    const style = columnBoxStyle({ background: "#fff", padding: 0, radius: 0 });
    expect(style).toEqual({ background: "#fff" });
  });
});
