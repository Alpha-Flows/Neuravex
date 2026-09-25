import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  MAX_EDGE,
  canOptimise,
  isAnimated,
  keepRedrawn,
  keptSize,
  renamed,
  srcSetOf,
  uploadAddresses,
  variantName,
  variantWidths,
} from "@/lib/image-plan";

const bytes = (text: string, patch: Record<number, number> = {}) => {
  const out = Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
  for (const [at, value] of Object.entries(patch)) out[Number(at)] = value;
  return out;
};

describe("a picture on its way into the library", () => {
  it("is redrawn when it is a photograph or a flat picture, and not otherwise", () => {
    expect(["a.jpg", "b.JPEG", "c.png", "d.webp"].map(canOptimise)).toEqual([true, true, true, true]);
    expect(["e.gif", "f.svg", "g.avif", "h.ico", "noext"].map(canOptimise)).toEqual([false, false, false, false, false]);
  });

  it("is sent as it is when it moves", () => {
    // An animated WebP: VP8X, with the animation flag in its first byte of flags.
    const webp = bytes("RIFF\0\0\0\0WEBPVP8X\0\0\0\0\0", { 20: 0x02 });
    expect(isAnimated(webp)).toBe(true);
    expect(isAnimated(bytes("RIFF\0\0\0\0WEBPVP8X\0\0\0\0\0", { 20: 0x10 }))).toBe(false);
    expect(isAnimated(bytes("\u0089PNG\r\n\u001a\n....acTL....IDAT"))).toBe(true);
    expect(isAnimated(bytes("\u0089PNG\r\n\u001a\n....IDAT....acTL"))).toBe(false);
    expect(isAnimated(bytes("ÿØÿà"))).toBe(false);
  });

  it("is kept no larger than a page will draw it", () => {
    expect(keptSize(6000, 4000)).toEqual({ width: MAX_EDGE, height: 1600 });
    expect(keptSize(3000, 6000)).toEqual({ width: 1200, height: MAX_EDGE });
    expect(keptSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it("gets the smaller copies a phone, a tablet and a laptop would be sent", () => {
    expect(variantWidths(2400)).toEqual([480, 960, 1600]);
    expect(variantWidths(1200)).toEqual([480, 960]);
    // A copy almost as wide as the picture is not worth a second file.
    expect(variantWidths(560)).toEqual([]);
  });

  it("is kept redrawn only when that made it smaller in pixels or noticeably lighter", () => {
    expect(keepRedrawn({ original: 1000, redrawn: 950, resized: false })).toBe(false);
    expect(keepRedrawn({ original: 1000, redrawn: 800, resized: false })).toBe(true);
    expect(keepRedrawn({ original: 1000, redrawn: 1200, resized: true })).toBe(true);
    expect(keepRedrawn({ original: 1000, redrawn: 0, resized: true })).toBe(false);
  });

  it("keeps its name, in its new format", () => {
    expect(renamed("Holiday.JPG", "webp")).toBe("Holiday.webp");
    expect(renamed("no extension", "webp")).toBe("no extension.webp");
    expect(variantName("Holiday.JPG", 480, "webp")).toBe("Holiday-480w.webp");
  });
});

describe("a picture on the page", () => {
  it("offers its copies widest first, itself among them when its width is known", () => {
    const copies = [
      { url: "/uploads/s.webp", width: 480 },
      { url: "/uploads/m.webp", width: 960 },
    ];
    expect(srcSetOf({ url: "/uploads/p.webp", width: 2400 }, copies)).toBe(
      "/uploads/p.webp 2400w, /uploads/m.webp 960w, /uploads/s.webp 480w",
    );
    expect(srcSetOf({ url: "/uploads/p.webp" }, copies)).toBe("/uploads/m.webp 960w, /uploads/s.webp 480w");
    // One candidate is no choice.
    expect(srcSetOf({ url: "/uploads/p.webp" }, [copies[0]])).toBeUndefined();
  });

  it("is found in a page's stored blocks by its address", () => {
    const json = JSON.stringify([{ props: { src: "/uploads/a.webp", backgroundImage: "url(/uploads/b.png)" } }, { props: { src: "/uploads/a.webp" } }]);
    expect(uploadAddresses(json)).toEqual(["/uploads/a.webp", "/uploads/b.png"]);
  });

  it("has its copies kept out of the library and deleted with it", () => {
    const media = readFileSync("src/app/api/media/route.ts", "utf8");
    expect(media).toContain("variantOf: { not: null }");
    expect(media).toContain("{ variantOf: url }");
    const upload = readFileSync("src/app/api/upload/route.ts", "utf8");
    expect(upload).toContain('req.headers.get("x-variant-of")');
  });
});
