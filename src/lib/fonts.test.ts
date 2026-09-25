import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  BUNDLED_FONTS,
  MAX_CUSTOM_FONTS,
  bundledFontFor,
  cleanFamilyName,
  customFontFace,
  familyOf,
  fontStack,
  guessFontFile,
  normalizeCustomFonts,
  siteFontFaces,
  type CustomFont,
} from "@/lib/fonts";
import { cssFontStack } from "@/lib/css-value";
import { siteThemeCss } from "@/lib/site-theme";
import { normalizeSiteFields } from "@/lib/site-fields";
import { collectLocalAssets, rewriteAssetPaths } from "@/lib/static-export";

const fontsDir = join(process.cwd(), "public", "fonts");
/** Every file a font's rules name, relative to `public/`. */
const filesNamed = (css: string) => [...css.matchAll(/url\("\/(fonts\/[^"]+)"\)/g)].map((m) => m[1]);

describe("the bundled fonts", () => {
  it("are all on disk, as woff2, each beside its licence", () => {
    for (const font of BUNDLED_FONTS) {
      const files = filesNamed(siteFontFaces({ fontFamily: fontStack(font.family, font.category) }));
      expect(files.length, font.id).toBe(font.italic ? 4 : 2);
      for (const rel of files) {
        const bytes = readFileSync(join(process.cwd(), "public", rel));
        expect(bytes.subarray(0, 4).toString("latin1"), rel).toBe("wOF2");
      }
      expect(readFileSync(join(fontsDir, font.id, "OFL.txt"), "utf8"), font.id).toMatch(/SIL OPEN FONT LICENSE/i);
    }
  });

  it("are each accounted for in the provenance list", () => {
    const readme = readFileSync(join(fontsDir, "README.md"), "utf8");
    for (const font of BUNDLED_FONTS) expect(readme, font.id).toContain(`@fontsource-variable/${font.id}`);
  });

  it("are declared under exactly the name the page then asks for", () => {
    // The page's `--site-font` goes through `cssFontStack`, which strips
    // everything but plain characters and re-quotes a name with a space. A
    // font whose name did not survive that would be declared and never used.
    for (const font of BUNDLED_FONTS) {
      const asked = familyOf(cssFontStack(fontStack(font.family, font.category)));
      expect(asked).toBe(font.family);
      expect(siteFontFaces({ fontFamily: fontStack(font.family) })).toContain(`font-family:"${font.family}"`);
    }
  });

  it("have unique ids and names", () => {
    expect(new Set(BUNDLED_FONTS.map((f) => f.id)).size).toBe(BUNDLED_FONTS.length);
    expect(new Set(BUNDLED_FONTS.map((f) => f.family.toLowerCase())).size).toBe(BUNDLED_FONTS.length);
    for (const font of BUNDLED_FONTS) expect(existsSync(join(fontsDir, font.id))).toBe(true);
  });
});

describe("which font a stack names", () => {
  it("reads the first family, quoted or not, in any case", () => {
    expect(familyOf('"Open Sans", ui-sans-serif, sans-serif')).toBe("Open Sans");
    expect(familyOf("'Open Sans', sans-serif")).toBe("Open Sans");
    expect(bundledFontFor("inter, system-ui")?.id).toBe("inter");
    expect(bundledFontFor("Georgia, serif")).toBeUndefined();
    expect(bundledFontFor("")).toBeUndefined();
    expect(bundledFontFor(null)).toBeUndefined();
  });

  it("brings the file of a font typed by name before there was a picker", () => {
    // A site saved with "Inter, system-ui, sans-serif" in the free-text box
    // showed Inter only where it was installed. It gets the bundled file now.
    const css = siteThemeCss({ fontFamily: "Inter, system-ui, sans-serif" });
    expect(css).toContain('@font-face{font-family:"Inter"');
    expect(css).toContain("--site-font: Inter, system-ui, sans-serif");
  });
});

describe("the rules a site gets", () => {
  it("are only for the fonts it uses, once each", () => {
    const one = siteFontFaces({ fontFamily: fontStack("Lora", "serif"), headingFont: fontStack("Lora", "serif") });
    expect(filesNamed(one)).toEqual([
      "fonts/lora/latin-normal.woff2",
      "fonts/lora/latin-ext-normal.woff2",
      "fonts/lora/latin-italic.woff2",
      "fonts/lora/latin-ext-italic.woff2",
    ]);
    expect(siteFontFaces({ fontFamily: "Georgia, serif" })).toBe("");
    expect(siteFontFaces({})).toBe("");
  });

  it("give an upright-only font no italic file to ask for", () => {
    expect(filesNamed(siteFontFaces({ headingFont: fontStack("Oswald", "display") }))).toEqual([
      "fonts/oswald/latin-normal.woff2",
      "fonts/oswald/latin-ext-normal.woff2",
    ]);
  });

  it("carry each script's range, so a page in English fetches only the Latin file", () => {
    const css = siteFontFaces({ fontFamily: fontStack("Inter") });
    expect(css).toMatch(/latin-normal\.woff2"\) format\("woff2"\);unicode-range:U\+0000-00FF/);
    expect(css).toMatch(/latin-ext-normal\.woff2"\) format\("woff2"\);unicode-range:U\+0100-02BA/);
    expect(css).toContain("font-display:swap");
    expect(css).toContain("font-weight:100 900");
  });

  it("come before the rules that use them, whatever the selector", () => {
    const css = siteThemeCss({ fontFamily: fontStack("Roboto"), headingFont: fontStack("Merriweather", "serif") }, ".public-canvas");
    expect(css.indexOf("@font-face")).toBeLessThan(css.indexOf(".public-canvas {"));
    expect(css).toContain('font-family:"Merriweather"');
    expect(css).not.toContain(":root");
  });
});

describe("a site's own fonts", () => {
  const acme: CustomFont = { family: "Acme Sans", url: "/uploads/k1x2.woff2", weight: "700", style: "italic", category: "serif" };

  it("keep an uploaded file under a plain name", () => {
    expect(normalizeCustomFonts([acme])).toEqual([acme]);
    expect(normalizeCustomFonts(JSON.stringify([acme]))).toEqual([acme]);
  });

  it("fill in what is missing and repair what is wrong", () => {
    expect(normalizeCustomFonts([{ family: "  Acme   Sans ", url: "/uploads/a.ttf", weight: "bold", style: "slanted", category: "script" }])).toEqual([
      { family: "Acme Sans", url: "/uploads/a.ttf", weight: "400", style: "normal", category: "sans" },
    ]);
  });

  it("refuse a file that is not an upload, and a name that could end the rule it is written into", () => {
    const refused = [
      { ...acme, url: "https://fonts.example.com/a.woff2" },
      { ...acme, url: "/uploads/a.woff2\");}body{background:url(//x.example/b" },
      { ...acme, url: "/uploads/sub/a.woff2" },
      { ...acme, url: "/uploads/a.svg" },
      { ...acme, family: 'Acme"}body{display:none' },
      { ...acme, family: "Acme;x" },
      { ...acme, family: "Café Sans" },
      { ...acme, family: "Inter" },
      { ...acme, family: "" },
      "Acme",
      null,
    ];
    expect(normalizeCustomFonts(refused)).toEqual([]);
    expect(normalizeCustomFonts("not json")).toEqual([]);
    expect(normalizeCustomFonts({ family: "Acme" })).toEqual([]);
  });

  it("hold one file per name, weight and style, and no more than the limit", () => {
    expect(normalizeCustomFonts([acme, { ...acme, url: "/uploads/other.woff2" }])).toHaveLength(1);
    expect(normalizeCustomFonts([acme, { ...acme, weight: "400" }])).toHaveLength(2);
    const many = Array.from({ length: MAX_CUSTOM_FONTS + 5 }, (_, i) => ({ ...acme, family: `Font ${i}` }));
    expect(normalizeCustomFonts(many)).toHaveLength(MAX_CUSTOM_FONTS);
  });

  it("are declared in the format each file is", () => {
    expect(customFontFace({ ...acme, style: "normal", url: "/uploads/a.ttf" })).toContain('src:url("/uploads/a.ttf") format("truetype")');
    expect(customFontFace({ ...acme, style: "normal", url: "/uploads/a.OTF" })).toContain('format("opentype")');
    expect(customFontFace({ ...acme, style: "normal" })).toBe(
      '@font-face{font-family:"Acme Sans";font-style:normal;font-display:swap;font-weight:700;src:url("/uploads/k1x2.woff2") format("woff2")}',
    );
  });

  it("are declared on the page only when a font field names them", () => {
    const fonts = JSON.stringify([acme, { ...acme, style: "normal", url: "/uploads/k1x3.woff2" }, { ...acme, family: "Unused" }]);
    const css = siteFontFaces({ headingFont: fontStack("Acme Sans", "serif"), fonts });
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).not.toContain("Unused");
    expect(siteFontFaces({ fonts })).toBe("");
  });

  it("are stored repaired, and not at all when there are none", () => {
    expect(normalizeSiteFields({ fonts: [acme, { family: "x", url: "javascript:1" }] })).toEqual({ fonts: JSON.stringify([acme]) });
    expect(normalizeSiteFields({ fonts: [] })).toEqual({ fonts: null });
    expect(normalizeSiteFields({ name: "Site" })).not.toHaveProperty("fonts");
    expect(normalizeSiteFields({}, { complete: true }).fonts).toBeNull();
  });
});

describe("naming a font file", () => {
  it("reads the family, weight and style a foundry's file name spells out", () => {
    expect(guessFontFile("AcmeSans-BoldItalic.woff2")).toEqual({ family: "Acme Sans", weight: "700", style: "italic" });
    expect(guessFontFile("Grotesk-SemiBold.woff")).toEqual({ family: "Grotesk", weight: "600", style: "normal" });
    expect(guessFontFile("PlayfairDisplay-ExtraLightItalic.ttf")).toEqual({ family: "Playfair Display", weight: "200", style: "italic" });
    expect(guessFontFile("Brand[wght].ttf")).toEqual({ family: "Brand", weight: "100 900", style: "normal" });
    expect(guessFontFile("house_font-regular.otf")).toEqual({ family: "house font", weight: "400", style: "normal" });
  });

  it("suggests only a name the site can keep", () => {
    expect(guessFontFile("Café-Light.woff").family).toBe("Cafe");
    expect(cleanFamilyName(guessFontFile("Café-Light.woff").family)).toBe("Cafe");
    expect(cleanFamilyName("Café")).toBe("");
    expect(cleanFamilyName("open sans")).toBe("");
  });
});

describe("the fonts in a downloaded site", () => {
  it("are collected from the page's stylesheet and pointed at beside it", () => {
    const html = `<style nonce="n">${siteThemeCss({ fontFamily: fontStack("Oswald", "display") })}</style><p>/fonts/x.woff2</p>`;
    expect(collectLocalAssets(html)).toEqual(["fonts/oswald/latin-ext-normal.woff2", "fonts/oswald/latin-normal.woff2"]);
    const rewritten = rewriteAssetPaths(html);
    expect(rewritten).toContain('url("fonts/oswald/latin-normal.woff2")');
    expect(rewritten).not.toContain('url("/fonts/');
    expect(rewritten).toContain("<p>/fonts/x.woff2</p>");
  });
});
