import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { BLOCKS, getBlockDefinition } from "@/lib/blocks";
import { TEMPLATES } from "@/lib/templates";
import { parseHex } from "@/lib/site-theme";
import { imageSize } from "@/lib/image-size";
import { BaseBlock } from "@/types";

/** Every string anywhere in a block tree, so nothing hides in a nested prop. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const REMOTE = /^(https?:)?\/\//i;

describe("block defaults", () => {
  it("has a definition for every block the palette offers", () => {
    for (const b of BLOCKS) expect(getBlockDefinition(b.type)).toBe(b);
  });

  it("ships no block that loads something off the machine", () => {
    // Neuravex runs locally and its sites are downloaded as files. A default
    // pointing at Unsplash or a demo clip on w3schools.com is a broken image
    // offline and someone else's uptime online.
    for (const b of BLOCKS) {
      const remote = strings(b.defaultProps).filter((s) => REMOTE.test(s));
      expect(remote, `${b.type} default props`).toEqual([]);
    }
  });

  it("points the image block at a picture that is actually bundled", () => {
    const src = getBlockDefinition("image")!.defaultProps.src as string;
    expect(src.startsWith("/stock/")).toBe(true);
    expect(existsSync(join(process.cwd(), "public", src))).toBe(true);
  });

  it("starts the video block empty rather than with someone else's video", () => {
    expect(getBlockDefinition("video")!.defaultProps.src).toBe("");
  });
});

describe("templates", () => {
  it("seed pages that work with no internet connection", () => {
    const offenders: string[] = [];
    for (const t of TEMPLATES) {
      for (const s of strings(t.pages)) if (REMOTE.test(s)) offenders.push(`${t.id}: ${s}`);
    }
    expect(offenders).toEqual([]);
  });

  it("only reference images that exist in public/", () => {
    const missing: string[] = [];
    for (const t of TEMPLATES) {
      for (const s of strings(t.pages)) {
        if (!s.startsWith("/stock/") && !s.startsWith("/uploads/")) continue;
        if (!existsSync(join(process.cwd(), "public", s))) missing.push(`${t.id}: ${s}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

/** Every block in a template, containers flattened. */
function allBlocks(list: BaseBlock[], out: BaseBlock[] = []): BaseBlock[] {
  for (const b of list) {
    out.push(b);
    if (b.children?.length) allBlocks(b.children, out);
  }
  return out;
}

const templateButtons = TEMPLATES.flatMap((t) =>
  t.pages.flatMap((p) => allBlocks(p.blocks).filter((b) => b.type === "button").map((b) => ({ t: t.id, b }))),
);

describe("site branding", () => {
  it("gives every block that carries branding an empty default, so the site decides", () => {
    expect(getBlockDefinition("button")!.defaultProps.color).toBe("");
    expect(getBlockDefinition("button")!.defaultProps.textColor).toBe("");
    expect(getBlockDefinition("heading")!.defaultProps.color).toBe("");
    expect(getBlockDefinition("text")!.defaultProps.color).toBe("");
    expect(getBlockDefinition("divider")!.defaultProps.color).toBe("");
  });

  it("declares a real accent colour for every template", () => {
    for (const t of TEMPLATES) expect(parseHex(t.accent), `${t.id}: ${t.accent}`).not.toBeNull();
  });

  it("leaves most template buttons reading the site accent", () => {
    const inheriting = templateButtons.filter(({ b }) => (b.props as { color?: string }).color === "");
    // The rest are deliberate: a light button on a dark hero, say.
    expect(inheriting.length).toBeGreaterThan(templateButtons.length * 0.8);
  });

  it("never paints an outline or ghost button's label white", () => {
    // That was the old default for every template button whatever its variant,
    // which on a light page is white text on white.
    const invisible = templateButtons.filter(
      ({ b }) =>
        ["outline", "ghost"].includes((b.props as { variant?: string }).variant ?? "") &&
        ["#ffffff", "#fff"].includes(((b.props as { textColor?: string }).textColor ?? "").toLowerCase()),
    );
    expect(invisible.map((x) => `${x.t}: ${(x.b.props as { label?: string }).label}`)).toEqual([]);
  });
});

const templateImages = TEMPLATES.flatMap((t) =>
  t.pages.flatMap((p) => allBlocks(p.blocks).filter((b) => b.type === "image").map((b) => ({ t: t.id, b }))),
);

describe("template images", () => {
  it("all describe themselves to a reader who cannot see them", () => {
    // Every template image used to ship with alt="".
    const silent = templateImages.filter(({ b }) => !((b.props as { alt?: string }).alt ?? "").trim());
    expect(silent.map((x) => `${x.t}: ${(x.b.props as { src?: string }).src}`)).toEqual([]);
  });

  it("all carry the file's own size, so a page holds its space while they load", () => {
    const unsized = templateImages.filter(({ b }) => {
      const p = b.props as { naturalWidth?: number; naturalHeight?: number };
      return !p.naturalWidth || !p.naturalHeight;
    });
    expect(unsized.map((x) => `${x.t}: ${(x.b.props as { src?: string }).src}`)).toEqual([]);
  });

  it("states a size that matches the file on disk", () => {
    // A wrong ratio reserves the wrong space, which is worse than none.
    const wrong: string[] = [];
    for (const { t, b } of templateImages.slice(0, 12)) {
      const p = b.props as { src: string; naturalWidth: number; naturalHeight: number };
      const actual = imageSize(readFileSync(join(process.cwd(), "public", p.src)));
      if (!actual || actual.width !== p.naturalWidth || actual.height !== p.naturalHeight) {
        wrong.push(`${t}: ${p.src} says ${p.naturalWidth}x${p.naturalHeight}, file is ${actual?.width}x${actual?.height}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
