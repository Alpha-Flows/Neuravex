import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { normalizeBlockTree } from "@/lib/block-tree";
import { getBlockDefinition } from "@/lib/blocks";
import { GALLERY_MAX_PICTURES, lightboxLinks, openLabel } from "@/lib/gallery-lightbox";
import { editedText, isBlank, plainText } from "@/lib/inline-text";
import type { GalleryProps, MediaItem } from "@/types";

/** A gallery block through the validator every write path and read path runs. */
function gallery(props: object): GalleryProps {
  const result = normalizeBlockTree([{ id: "g1", type: "gallery", props }]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.tree[0].props as GalleryProps;
}

const picture = (n: number): MediaItem => ({ src: `/stock/p${n}.jpg`, alt: `Picture ${n}`, caption: "" });

describe("a gallery's pictures on the way in", () => {
  it("keeps the first sixty of a longer list rather than refusing it", () => {
    // A list one entry too long used to come back as an empty one, which is a
    // whole gallery gone for one picture too many.
    const images = Array.from({ length: 75 }, (_, i) => picture(i + 1));
    const out = gallery({ images });
    expect(out.images).toHaveLength(GALLERY_MAX_PICTURES);
    expect(out.images[0].src).toBe("/stock/p1.jpg");
    expect(out.images[GALLERY_MAX_PICTURES - 1].src).toBe(`/stock/p${GALLERY_MAX_PICTURES}.jpg`);
  });

  it("empties an address that would run something", () => {
    // The tile's src and the lightbox's both come from here, and the export
    // writes them into a file no CSP will ever see.
    const out = gallery({
      images: [
        { src: "javascript:alert(1)", alt: "one" },
        { src: " JaVaScRiPt:alert(1)", alt: "two" },
        { src: "data:text/html;base64,PHNjcmlwdD4=", alt: "three" },
        { src: "vbscript:msgbox(1)", alt: "four" },
      ],
    });
    expect(out.images.map((i) => i.src)).toEqual(["", "", "", ""]);
    // The entry survives with its words, so the editor can show the hole and
    // the author can choose a picture for it.
    expect(out.images.map((i) => i.alt)).toEqual(["one", "two", "three", "four"]);
  });

  it("keeps an ordinary address, a bundled one and an inline picture", () => {
    const out = gallery({
      images: [
        { src: "https://example.com/a.jpg", alt: "" },
        { src: "/uploads/b.png", alt: "" },
        { src: "data:image/png;base64,iVBORw0KGgo=", alt: "" },
      ],
    });
    expect(out.images.map((i) => i.src)).toEqual([
      "https://example.com/a.jpg",
      "/uploads/b.png",
      "data:image/png;base64,iVBORw0KGgo=",
    ]);
  });

  it("drops an entry that is not a picture and keeps the rest", () => {
    const out = gallery({ images: [null, "cat.jpg", 42, [picture(9)], picture(1), true, picture(2)] });
    expect(out.images.map((i) => i.src)).toEqual(["/stock/p1.jpg", "/stock/p2.jpg"]);
  });

  it("comes back with no pictures, not a failure, when the list is not a list", () => {
    expect(gallery({ images: "not a list" }).images).toEqual([]);
    expect(gallery({}).images).toEqual([]);
  });

  it("sanitises a caption down to inline text", () => {
    const out = gallery({
      images: [
        {
          src: "/stock/a.jpg",
          alt: "A",
          caption: 'Opening <b>night</b><script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">here</a>',
        },
      ],
    });
    const caption = out.images[0].caption ?? "";
    expect(caption).toContain("<b>night</b>");
    expect(caption).not.toMatch(/<script|<img|onerror|javascript:/i);
    expect(caption).toContain("here");
  });

  it("keeps a picture's size only when it is a size", () => {
    const out = gallery({
      images: [
        { src: "/a.jpg", alt: "", naturalWidth: 2560, naturalHeight: "1706" },
        { src: "/b.jpg", alt: "", naturalWidth: -4, naturalHeight: "tall" },
      ],
    });
    expect(out.images[0]).toMatchObject({ naturalWidth: 2560, naturalHeight: 1706 });
    expect(out.images[1].naturalWidth).toBeUndefined();
    expect(out.images[1].naturalHeight).toBeUndefined();
  });

  it("does not store an alt text longer than a row is meant to hold", () => {
    // The field is repaired to empty and the picture kept, rather than the
    // whole save refused for one runaway description.
    const out = gallery({ images: [{ src: "/a.jpg", alt: "x".repeat(5000) }] });
    expect(out.images).toHaveLength(1);
    expect(out.images[0].alt.length).toBeLessThanOrEqual(1000);
  });
});

describe("a gallery's settings on the way in", () => {
  it("brings the column count into range rather than back to the default", () => {
    expect(gallery({ columns: 7 }).columns).toBe(4);
    expect(gallery({ columns: 1 }).columns).toBe(2);
    expect(gallery({ columns: "2" }).columns).toBe(2);
    expect(gallery({ columns: 3.6 }).columns).toBe(4);
  });

  it("falls back to three columns when the count is not a number", () => {
    expect(gallery({ columns: "many" }).columns).toBe(3);
    expect(gallery({}).columns).toBe(3);
    expect(gallery({ columns: Infinity }).columns).toBe(3);
  });

  it("keeps the gap between nothing and 64px", () => {
    expect(gallery({ gap: 400 }).gap).toBe(64);
    expect(gallery({ gap: -10 }).gap).toBe(0);
    expect(gallery({ gap: "16" }).gap).toBe(16);
    expect(gallery({ gap: "wide" }).gap).toBe(12);
    expect(gallery({}).gap).toBe(12);
  });

  it("repairs a shape, a corner and a switch it does not know", () => {
    const out = gallery({ aspect: "panorama", rounded: "full", lightbox: "yes" });
    expect(out.aspect).toBe("square");
    expect(out.rounded).toBe("md");
    expect(out.lightbox).toBe(true);
    expect(gallery({ aspect: "natural", rounded: "xl", lightbox: false })).toMatchObject({
      aspect: "natural",
      rounded: "xl",
      lightbox: false,
    });
  });

  it("passes its own defaults through unchanged", () => {
    // The MCP server hands these to agents as the example of a gallery, so
    // they have to be a gallery the validator agrees with.
    const defaults = getBlockDefinition("gallery")!.defaultProps as GalleryProps;
    expect(gallery(defaults)).toEqual(defaults);
  });
});

describe("the lightbox's links", () => {
  it("gives every picture an overlay, a tile and both neighbours, wrapping round", () => {
    const links = lightboxLinks("g1", 3);
    expect(links).toEqual([
      { id: "nvx-g1-photo-1", tile: "nvx-g1-tile-1", previous: "nvx-g1-photo-3", next: "nvx-g1-photo-2" },
      { id: "nvx-g1-photo-2", tile: "nvx-g1-tile-2", previous: "nvx-g1-photo-1", next: "nvx-g1-photo-3" },
      { id: "nvx-g1-photo-3", tile: "nvx-g1-tile-3", previous: "nvx-g1-photo-2", next: "nvx-g1-photo-1" },
    ]);
  });

  it("gives a single picture nowhere to step to", () => {
    const [only] = lightboxLinks("g1", 1);
    expect(only.previous).toBeUndefined();
    expect(only.next).toBeUndefined();
    expect(lightboxLinks("g1", 0)).toEqual([]);
  });

  it("makes ids that are safe in a fragment and unique on the page", () => {
    const links = lightboxLinks(`a b"c#d`, GALLERY_MAX_PICTURES);
    const ids = links.flatMap((l) => [l.id, l.tile]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^nvx-[A-Za-z0-9_-]+$/);
    expect(lightboxLinks("one", 2)[0].id).not.toBe(lightboxLinks("two", 2)[0].id);
  });

  it("names a tile by what opening it does and what it shows", () => {
    expect(openLabel(2, 6, "A misty forest path")).toBe("Open picture 2 of 6: A misty forest path");
    expect(openLabel(1, 1, "   ")).toBe("Open picture 1 of 1");
    expect(openLabel(3, 4, undefined)).toBe("Open picture 3 of 4");
  });
});

describe("a caption with nothing in it", () => {
  it("counts what a caption cleared on the canvas leaves behind as none", () => {
    // Selecting a caption on the canvas and deleting it stores "<br />", not
    // "". Tested as a string, that drew an empty line under the tile on the
    // published page and kept room for a caption in the lightbox.
    for (const blank of [undefined, "", "   ", "<br>", "<br />", "&nbsp;", "<b> </b>"]) {
      expect(isBlank(blank), JSON.stringify(blank)).toBe(true);
    }
    for (const shown of ["Opening night", "<b>Menu</b>", "&amp;", "0", "Ribs<br />slow-cooked"]) {
      expect(isBlank(shown), shown).toBe(false);
    }
  });
});

describe("a caption typed into the panel", () => {
  /** What the panel stores for a box now reading `typed`, and what it then shows. */
  function throughPanel(stored: string, typed: string) {
    const next = gallery({ images: [{ src: "/a.jpg", alt: "", caption: editedText(stored, typed) }] }).images[0].caption ?? "";
    return { stored: next, shown: plainText(next) };
  }

  it("shows an ampersand as one, not as the entity it is stored as", () => {
    const { stored, shown } = throughPanel("", "Fish & chips <3");
    expect(stored).toBe("Fish &amp; chips &lt;3");
    expect(shown).toBe("Fish & chips <3");
  });

  it("keeps a typed angle bracket as text rather than reading it as a tag", () => {
    // Parsed as markup, everything after "<a" was taken for an unfinished
    // link and the caption was stored as "Rooms 1".
    expect(throughPanel("", "Rooms 1<a and 2").shown).toBe("Rooms 1<a and 2");
  });

  it("keeps formatting from the canvas while the words are unchanged", () => {
    const bold = "Ribs, <b>slow-cooked</b>";
    expect(editedText(bold, plainText(bold))).toBe(bold);
    expect(throughPanel(bold, "Ribs, slow-cooked for hours").stored).toBe("Ribs, slow-cooked for hours");
  });
});

describe("what the lightbox's CSS has to keep saying", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const start = css.indexOf("/* == block: gallery == */");
  const end = css.indexOf("/* == end block: gallery == */");
  const region = css.slice(start, end);
  const flat = region.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  /**
   * Every declaration given to a selector in the region, from each rule that
   * names it, alone or in a list. Asking for one whole rule as a string failed
   * the moment a declaration was added beside the one being checked.
   */
  const declarations = (selector: string) => {
    const out: string[] = [];
    for (const rule of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (rule[1].split(",").some((s) => s.trim() === selector)) out.push(rule[2]);
    }
    return out.join(";");
  };

  it("has a region to read", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("hides the page behind an open picture from focus and from screen readers", () => {
    // Painting over the page left Tab walking on into the header's links
    // behind the backdrop. Hidden, nothing behind can be focused or read.
    expect(declarations("html:has(.nvx-gallery-lightbox:target:not(.editor-mode *)) body")).toMatch(/visibility:\s*hidden/);
    expect(declarations(".nvx-gallery-lightbox:target:not(.editor-mode *)")).toMatch(/visibility:\s*visible/);
    expect(source("src/components/blocks/Gallery.tsx")).toContain('aria-modal="true"');
  });

  it("never opens a picture over the builder, or hides the builder for one", () => {
    expect(declarations(".editor-mode .nvx-gallery-lightbox:target")).toMatch(/display:\s*none/);
    // Every rule that reaches outside the gallery is keyed on an open picture
    // that is not inside the builder.
    const reaches = flat.match(/:has\([^)]*lightbox[^)]*\)/g) ?? [];
    expect(reaches.length).toBeGreaterThan(0);
    for (const selector of reaches) expect(selector).toContain(":not(.editor-mode *)");
  });

  it("draws the caption placeholder from the component's class, not from what the caption holds", () => {
    // `:has(> br:only-child)` matched "text<br>more" too, because
    // `:only-child` counts elements, and drew the placeholder over the words.
    expect(flat).not.toMatch(/only-child|:empty/);
    expect(flat).toContain(".nvx-gallery-caption-add[data-placeholder]::before");
  });

  it("holds a place for a natural picture whose size is unknown, and only for one", () => {
    expect(declarations('.nvx-gallery-grid[data-aspect="natural"] .nvx-gallery-img:not([width][height])')).toMatch(/aspect-ratio:\s*auto 4 \/ 3/);
  });

  it("loads the panel's thumbnails lazily and shows captions as words", () => {
    const panel = source("src/components/editor/inspectors/GalleryPanel.tsx");
    expect(panel).toMatch(/loading="lazy"/);
    expect(panel).toContain("value={plainText(item.caption)}");
    expect(panel).toContain("editedText(item.caption");
  });
});
