import { describe, it, expect } from "vitest";
import { normalizeBlockTree } from "@/lib/block-tree";
import { getBlockDefinition } from "@/lib/blocks";
import { domId } from "@/lib/dom-id";
import {
  MAX_SLIDES,
  SLIDER_RATIOS,
  neighbourSlide,
  slidePositionLabel,
  slidesToDraw,
} from "@/lib/slider-nav";
import type { SliderProps } from "@/types";

/** One slider through the validator every write path and both read paths use. */
function slider(props: unknown): SliderProps {
  const result = normalizeBlockTree([{ id: "hero", type: "slider", props }]);
  if (!result.ok) throw new Error(result.error);
  expect(result.tree).toHaveLength(1);
  return result.tree[0].props as SliderProps;
}

const picture = (i: number) => ({ src: `/uploads/slide-${i}.jpg`, alt: `Slide ${i}`, caption: "" });

describe("a slider's props on the way in", () => {
  it("keeps the palette's example exactly as it is", () => {
    // The MCP server hands this to an agent as the example of a good slider,
    // so the validator must have nothing to say about it.
    const example = getBlockDefinition("slider")!.defaultProps;
    expect(slider(example)).toEqual(example);
  });

  it("cuts a list past the cap to the first thirty rather than emptying it", () => {
    const props = slider({ slides: Array.from({ length: 45 }, (_, i) => picture(i)) });
    expect(props.slides).toHaveLength(30);
    expect(props.slides[0].src).toBe("/uploads/slide-0.jpg");
    expect(props.slides[29].src).toBe("/uploads/slide-29.jpg");
  });

  it("stops the canvas and the panel offering to add a slide at the same number", () => {
    // Two numbers in two files. If they drift apart, the panel either stops
    // early or lets somebody add a picture that the next save throws away.
    expect(slider({ slides: Array.from({ length: MAX_SLIDES + 1 }, (_, i) => picture(i)) }).slides).toHaveLength(MAX_SLIDES);
    expect(slider({ slides: Array.from({ length: MAX_SLIDES }, (_, i) => picture(i)) }).slides).toHaveLength(MAX_SLIDES);
  });

  it("empties a source that would run something, and keeps the slide", () => {
    const props = slider({
      slides: [
        { src: "javascript:alert(1)", alt: "One" },
        { src: " JaVaScRiPt:alert(1)", alt: "Two" },
        { src: "data:text/html;base64,PHNjcmlwdD4=", alt: "Three" },
        { src: "vbscript:msgbox(1)", alt: "Four" },
        { src: "mailto:someone@example.com", alt: "Five" },
      ],
    });
    expect(props.slides.map((s) => s.src)).toEqual(["", "", "", "", ""]);
    expect(props.slides.map((s) => s.alt)).toEqual(["One", "Two", "Three", "Four", "Five"]);
  });

  it("keeps the sources a picture can legitimately come from", () => {
    const sources = [
      "/stock/nature/sam-ferrara-1527pjeb6jg-unsplash.jpg",
      "/uploads/holiday.webp",
      "https://images.example.com/a.jpg",
      "data:image/png;base64,iVBORw0KGgo=",
    ];
    expect(slider({ slides: sources.map((src) => ({ src, alt: "" })) }).slides.map((s) => s.src)).toEqual(sources);
  });

  it("drops an entry that is not a slide and keeps the rest", () => {
    const props = slider({
      slides: [null, "/uploads/a.jpg", 42, ["/uploads/b.jpg"], picture(1), undefined, true, picture(2)],
    });
    expect(props.slides.map((s) => s.src)).toEqual(["/uploads/slide-1.jpg", "/uploads/slide-2.jpg"]);
  });

  it("comes back with no slides, not a crash, when the list is not a list", () => {
    for (const slides of [undefined, null, "three pictures", 3, { 0: picture(0) }]) {
      expect(slider({ slides }).slides).toEqual([]);
    }
  });

  it("repairs a slide whose fields are the wrong type instead of dropping it", () => {
    const [slide] = slider({
      slides: [{ src: "/uploads/a.jpg", alt: 7, caption: { html: "x" }, naturalWidth: "wide", naturalHeight: -5, altFromLibrary: "yes" }],
    }).slides;
    expect(slide.src).toBe("/uploads/a.jpg");
    expect(slide.alt).toBe("");
    expect(slide.caption).toBe("");
    expect(slide.naturalWidth).toBeUndefined();
    expect(slide.naturalHeight).toBeUndefined();
    expect(slide.altFromLibrary).toBeUndefined();
  });

  it("keeps a picture's own size, so the page can hold its shape", () => {
    const [slide] = slider({ slides: [{ src: "/uploads/a.jpg", alt: "", naturalWidth: "2560", naturalHeight: 1706 }] }).slides;
    expect(slide.naturalWidth).toBe(2560);
    expect(slide.naturalHeight).toBe(1706);
  });

  it("sanitises a caption, which is drawn as HTML over the picture", () => {
    const [slide] = slider({
      slides: [{ src: "/uploads/a.jpg", alt: "", caption: 'Sunset <b>over</b> the bay<img src=x onerror="alert(1)"><script>alert(2)</script>' }],
    }).slides;
    expect(slide.caption).toContain("<b>over</b>");
    expect(slide.caption).not.toMatch(/<img|onerror|<script|alert\(2\)/i);
  });

  it("puts back a shape, a corner or a switch it does not recognise", () => {
    const props = slider({ slides: [picture(0)], ratio: "3/2", rounded: "full", showArrows: "yes", showDots: 0 });
    expect(props.ratio).toBe("16/9");
    expect(props.rounded).toBe("xl");
    expect(props.showArrows).toBe(true);
    expect(props.showDots).toBe(true);
  });

  it("keeps every shape the panel offers, and an author's choice to hide the controls", () => {
    for (const ratio of SLIDER_RATIOS) expect(slider({ ratio }).ratio).toBe(ratio);
    for (const rounded of ["none", "md", "xl"] as const) expect(slider({ rounded }).rounded).toBe(rounded);
    const props = slider({ showArrows: false, showDots: false });
    expect(props.showArrows).toBe(false);
    expect(props.showDots).toBe(false);
  });
});

describe("moving between slides", () => {
  it("leads each arrow to its neighbour, going round at either end", () => {
    expect(neighbourSlide(0, 5, 1)).toBe(1);
    expect(neighbourSlide(3, 5, -1)).toBe(2);
    expect(neighbourSlide(4, 5, 1)).toBe(0);
    expect(neighbourSlide(0, 5, -1)).toBe(4);
    // Two slides: both arrows lead to the other one.
    expect(neighbourSlide(0, 2, 1)).toBe(1);
    expect(neighbourSlide(0, 2, -1)).toBe(1);
    expect(neighbourSlide(0, 0, 1)).toBe(0);
  });

  it("names each slide by where it stands", () => {
    expect(slidePositionLabel(1, 5)).toBe("2 of 5");
  });

  it("shows a visitor only the slides with a picture, numbered among themselves", () => {
    const props = slider({ slides: [picture(0), { src: "javascript:alert(1)", alt: "" }, picture(2)] });
    const visitor = slidesToDraw(props.slides, false);
    expect(visitor.map((d) => d.index)).toEqual([0, 2]);
    // The author still sees the refused one, so it can be given a picture.
    expect(slidesToDraw(props.slides, true).map((d) => d.index)).toEqual([0, 1, 2]);
  });

  it("gives every slide a link target that is safe in a fragment, whatever the block's id", () => {
    const id = domId('a b"#<x>', "slide", 3);
    expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    expect(id.endsWith("-slide-3")).toBe(true);
  });
});
