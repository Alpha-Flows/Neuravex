import { describe, it, expect } from "vitest";
import { backgroundStyle, columnBoxStyle, cssUrl, gradientCss, normalizeAngle } from "@/lib/block-style";
import { normalizeBlockTree } from "@/lib/block-tree";

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
    expect(backgroundStyle({ background: "#101010" })).toEqual({ background: "#101010", color: "#ffffff" });
  });

  it("gives a flat backdrop a text colour that reads on it", () => {
    // A block is allowed to carry no colour of its own, and a dark section
    // used to leave it inheriting the page's near-black: a heading dropped
    // onto #0b0f1e was written in #0f172a and could not be read at all.
    expect(backgroundStyle({ background: "#0b0f1e" }).color).toBe("#ffffff");
    expect(backgroundStyle({ background: "#ffffff" }).color).toBe("#0f172a");
    // Perceived brightness, so a saturated yellow counts as light.
    expect(backgroundStyle({ background: "#facc15" }).color).toBe("#0f172a");
  });

  it("claims nothing it cannot see through", () => {
    // Behind a photograph, or through a colour with an alpha, the light is
    // whatever is underneath — so the text keeps the colour it was given.
    expect(backgroundStyle({ background: "transparent" }).color).toBeUndefined();
    expect(backgroundStyle({ background: "rgba(0,0,0,0.4)" }).color).toBeUndefined();
    expect(backgroundStyle({ background: "#101010", backgroundImage: "/a.jpg" }).color).toBeUndefined();
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
      // Written with a unit rather than as a bare number, because the value
      // is checked on the way out now and a checked length carries one.
      padding: "24px",
      borderRadius: "12px",
    });
  });

  it("leaves padding and radius off when they are zero", () => {
    const style = columnBoxStyle({ background: "#fff", padding: 0, radius: 0 });
    expect(style).toEqual({ background: "#fff", color: "#0f172a" });
  });
});

describe("a backdrop cannot carry a second declaration", () => {
  it("drops a background colour with a `;` in it", () => {
    expect(backgroundStyle({ background: "#fff;background-image:url(https://attacker.example/p)" })).toEqual({});
  });

  it("drops an overlay that is not a colour", () => {
    const style = backgroundStyle({
      backgroundImage: "/a.jpg",
      backgroundOverlay: "rgba(0,0,0,.4);behavior:url(evil.htc)",
    });
    expect(style.backgroundImage).toBe('url("/a.jpg")');
    expect(JSON.stringify(style)).not.toContain("behavior");
  });

  it("drops a padding that is not a length", () => {
    const style = columnBoxStyle({
      background: "#fff",
      padding: "24px;position:fixed" as unknown as number,
    });
    expect(style).not.toHaveProperty("padding");
  });

  it("keeps the overlay it was meant to keep", () => {
    expect(backgroundStyle({ backgroundImage: "/a.jpg", backgroundOverlay: "rgba(0,0,0,0.4)" }).backgroundImage)
      .toBe('linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url("/a.jpg")');
  });
});

describe("a gradient behind a section or a column", () => {
  it("is drawn instead of the colour, from one end to the other at its angle", () => {
    expect(backgroundStyle({ background: "#ffffff", backgroundGradient: { from: "#0f172a", to: "#1e3a8a", angle: 135 } })).toEqual({
      background: "linear-gradient(135deg, #0f172a, #1e3a8a)",
      color: "#ffffff",
    });
  });

  it("gives up its place to a picture, which always wins", () => {
    const style = backgroundStyle({ backgroundImage: "/uploads/a.jpg", backgroundGradient: { from: "#000000", to: "#ffffff", angle: 90 } });
    expect(style.backgroundImage).toBe('url("/uploads/a.jpg")');
    expect(style).not.toHaveProperty("background");
  });

  it("reads text off the colour halfway along when the two ends disagree", () => {
    // Slate to white: the middle is a light grey, and dark text reads on it.
    expect(backgroundStyle({ backgroundGradient: { from: "#475569", to: "#ffffff", angle: 180 } }).color).toBe("#0f172a");
    // Black to white: the middle is #808080, which counts as dark, as it does for a flat colour.
    expect(backgroundStyle({ backgroundGradient: { from: "#000000", to: "#ffffff", angle: 180 } }).color).toBe("#ffffff");
    // Two palette colours that agree answer with the slot's own token.
    expect(
      backgroundStyle({ backgroundGradient: { from: "var(--site-color-1, #0f172a)", to: "var(--site-color-1, #0f172a)", angle: 180 } }).color,
    ).toBe("var(--site-color-1-contrast, #ffffff)");
  });

  it("claims no text colour it cannot see", () => {
    expect(backgroundStyle({ backgroundGradient: { from: "rgba(0,0,0,0.4)", to: "transparent", angle: 180 } })).toEqual({
      background: "linear-gradient(180deg, rgba(0,0,0,0.4), transparent)",
    });
  });

  it("is not drawn with an end that is not a colour, whatever reached the database", () => {
    expect(gradientCss({ from: "red;background:url(//x.example)", to: "#fff", angle: 0 })).toBeUndefined();
    expect(backgroundStyle({ background: "#101010", backgroundGradient: { from: "", to: "#fff", angle: 0 } })).toEqual({
      background: "#101010",
      color: "#ffffff",
    });
  });

  it("keeps its angle to whole degrees round the circle", () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450.4)).toBe(90);
    expect(normalizeAngle(Number.NaN)).toBe(180);
  });

  it("survives the validator on a section and a column, and a one-ended one does not", () => {
    const result = normalizeBlockTree([
      { id: "s", type: "section", props: { background: "#ffffff", backgroundGradient: { from: "#0f172a", to: "#1e3a8a", angle: "-45" } } },
      {
        id: "c",
        type: "columns",
        props: { count: 2, gap: 24, columnStyles: [{ backgroundGradient: { from: "#fef08a", to: "javascript:1", angle: 90 } }, { backgroundGradient: { from: "#fef08a", to: "#fed7aa", angle: 90 } }] },
      },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].props.backgroundGradient).toEqual({ from: "#0f172a", to: "#1e3a8a", angle: 315 });
    expect(result.tree[1].props.columnStyles[0].backgroundGradient).toBeUndefined();
    expect(result.tree[1].props.columnStyles[1].backgroundGradient).toEqual({ from: "#fef08a", to: "#fed7aa", angle: 90 });
  });
});
