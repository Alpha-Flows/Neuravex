/**
 * The fonts a site can use, and the `@font-face` rules that bring them along.
 *
 * A site's fonts were two boxes of free text written straight into a CSS
 * `font-family`. "Inter" typed there showed Inter on the author's machine,
 * where it happened to be installed, and Arial or Times on every visitor's —
 * the builder never shipped a font file, so the only fonts that worked were the
 * ones every computer already has. The ones below are bundled under
 * `public/fonts/`, served by the builder, and copied into a downloaded site
 * beside its pages, so they look the same everywhere with nothing fetched from
 * anybody else's server. A font of the author's own is uploaded to the library
 * and named, and kept on the site in `fonts` (see `normalizeCustomFonts`).
 *
 * Each bundled font is one variable file per script and style, covering every
 * weight it has: Latin, which is enough for English, German and the other
 * western European languages, and Latin Extended, which the browser fetches
 * only when a page uses a letter from it. All are under the SIL Open Font
 * License; `public/fonts/README.md` says where each came from.
 *
 * No dependencies: the site settings panel, a client component, reads this.
 */

export type FontCategory = "sans" | "serif" | "display" | "mono";

export interface BundledFont {
  /** The folder under `public/fonts/`. */
  id: string;
  family: string;
  category: FontCategory;
  /** The weights the variable file covers, as `font-weight` takes them. */
  weight: string;
  /** Whether an italic file is bundled; without one the browser slants the upright. */
  italic: boolean;
}

export const BUNDLED_FONTS: readonly BundledFont[] = [
  { id: "inter", family: "Inter", category: "sans", weight: "100 900", italic: true },
  { id: "roboto", family: "Roboto", category: "sans", weight: "100 900", italic: true },
  { id: "open-sans", family: "Open Sans", category: "sans", weight: "300 800", italic: true },
  { id: "montserrat", family: "Montserrat", category: "sans", weight: "100 900", italic: true },
  { id: "nunito", family: "Nunito", category: "sans", weight: "200 1000", italic: true },
  { id: "work-sans", family: "Work Sans", category: "sans", weight: "100 900", italic: true },
  { id: "dm-sans", family: "DM Sans", category: "sans", weight: "100 1000", italic: true },
  { id: "source-sans-3", family: "Source Sans 3", category: "sans", weight: "200 900", italic: true },
  { id: "space-grotesk", family: "Space Grotesk", category: "sans", weight: "300 700", italic: false },
  { id: "playfair-display", family: "Playfair Display", category: "serif", weight: "400 900", italic: true },
  { id: "lora", family: "Lora", category: "serif", weight: "400 700", italic: true },
  { id: "merriweather", family: "Merriweather", category: "serif", weight: "300 900", italic: true },
  { id: "source-serif-4", family: "Source Serif 4", category: "serif", weight: "200 900", italic: true },
  { id: "eb-garamond", family: "EB Garamond", category: "serif", weight: "400 800", italic: true },
  { id: "oswald", family: "Oswald", category: "display", weight: "200 700", italic: false },
  { id: "jetbrains-mono", family: "JetBrains Mono", category: "mono", weight: "100 800", italic: true },
];

/** The two scripts bundled, and the characters each covers — the same for every font. */
const SUBSETS = [
  {
    name: "latin",
    range:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  {
    name: "latin-ext",
    range:
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  },
] as const;

/** What a browser shows while the font loads, and if it never does. */
export const FALLBACKS: Record<FontCategory, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  display: "ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

/** The first family a CSS `font-family` names, unquoted. */
export function familyOf(stack: string | null | undefined): string {
  if (!stack) return "";
  const first = stack.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "").trim();
}

/** The bundled font a stack starts with, if it starts with one. */
export function bundledFontFor(stack: string | null | undefined): BundledFont | undefined {
  const family = familyOf(stack).toLowerCase();
  return family ? BUNDLED_FONTS.find((f) => f.family.toLowerCase() === family) : undefined;
}

/** A family, quoted, with the fallbacks for its kind: what the font fields store. */
export function fontStack(family: string, category: FontCategory = "sans"): string {
  return `"${family}", ${FALLBACKS[category]}`;
}

/** The `@font-face` rules for one bundled font, one per script and style. */
export function bundledFontFaces(font: BundledFont): string {
  const styles = font.italic ? (["normal", "italic"] as const) : (["normal"] as const);
  const rules: string[] = [];
  for (const style of styles) {
    for (const subset of SUBSETS) {
      rules.push(
        `@font-face{font-family:"${font.family}";font-style:${style};font-display:swap;font-weight:${font.weight};` +
          `src:url("/fonts/${font.id}/${subset.name}-${style}.woff2") format("woff2");unicode-range:${subset.range}}`,
      );
    }
  }
  return rules.join("\n");
}

// ---------------------------------------------------------------------------
// Fonts of the author's own
// ---------------------------------------------------------------------------

/** A font file from the library, and the family name the site knows it by. */
export interface CustomFont {
  family: string;
  /** An upload: `/uploads/<name>.woff2`, `.woff`, `.ttf` or `.otf`. */
  url: string;
  /** A weight, or a range for a variable file. */
  weight: string;
  style: "normal" | "italic";
  category: FontCategory;
}

export const MAX_CUSTOM_FONTS = 20;

const FONT_FILE = /^\/uploads\/[A-Za-z0-9._-]+\.(woff2|woff|ttf|otf)$/i;
const FORMATS: Record<string, string> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

/**
 * A family name that can go into a stylesheet as it is: plain letters,
 * digits, spaces, underscores and dashes, and not one of the bundled fonts'
 * names, which would put two different fonts under one name.
 *
 * Plain letters because the font fields are cleaned by `cssFontStack` on the
 * way into the page, which keeps nothing else. "Café Sans" accepted here would
 * be declared under that name and asked for by the page as "Caf Sans" — a
 * family nobody had declared, so every visitor would see the fallback.
 */
export function cleanFamilyName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(name)) return "";
  if (BUNDLED_FONTS.some((f) => f.family.toLowerCase() === name.toLowerCase())) return "";
  return name;
}

/**
 * The site's own fonts, repaired: each an uploaded font file under a name
 * that is safe to write into a stylesheet. The rules built from these go
 * into a `<style>` element, so nothing reaches one that could close it or
 * point it somewhere other than the builder's own uploads.
 */
export function normalizeCustomFonts(raw: unknown): CustomFont[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: CustomFont[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const v = entry as Record<string, unknown>;
    const family = cleanFamilyName(v.family);
    const url = typeof v.url === "string" && FONT_FILE.test(v.url) ? v.url : "";
    if (!family || !url) continue;
    const weight = typeof v.weight === "string" && /^[1-9]00(?: [1-9]00|1000)?$/.test(v.weight) ? v.weight : "400";
    const style = v.style === "italic" ? "italic" : "normal";
    const category = (["sans", "serif", "display", "mono"] as const).find((c) => c === v.category) ?? "sans";
    if (out.some((f) => f.family === family && f.style === style && f.weight === weight)) continue;
    out.push({ family, url, weight, style, category });
    if (out.length >= MAX_CUSTOM_FONTS) break;
  }
  return out;
}

/** The weights offered for a font file of one's own, lightest first. */
export const FONT_WEIGHTS = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" },
  { value: "900", label: "Black" },
  { value: "100 900", label: "Variable, every weight" },
] as const;

/** Weight names as foundries spell them, the longer before the shorter. */
const WEIGHT_WORDS: [RegExp, string][] = [
  [/\b(black|heavy)\b/i, "900"],
  [/\bextra ?bold\b/i, "800"],
  [/\b(semi|demi) ?bold\b/i, "600"],
  [/\bbold\b/i, "700"],
  [/\bmedium\b/i, "500"],
  [/\bextra ?light\b/i, "200"],
  [/\blight\b/i, "300"],
  [/\bthin\b/i, "100"],
];

/**
 * What a font file's name says about it, as a starting point for the form
 * that names it. A foundry's files are called `AcmeSans-BoldItalic.woff2`,
 * and asking the author to type "Acme Sans", pick Bold and pick Italic for
 * what the file name already spells out is how a bold file gets filed as
 * Regular. The author can change any of it before it is added.
 */
export function guessFontFile(fileName: string): Pick<CustomFont, "family" | "weight" | "style"> {
  const base = fileName
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ");
  const style = /\b(italic|oblique)\b/i.test(base) ? "italic" : "normal";
  const variable = /\b(variable|vf)\b/i.test(base) || /\[wght/i.test(fileName);
  const weight = variable ? "100 900" : (WEIGHT_WORDS.find(([word]) => word.test(base))?.[1] ?? "400");
  const family = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /\b(regular|italic|oblique|variable|vf|webfont|black|heavy|extra ?bold|(?:semi|demi) ?bold|bold|medium|extra ?light|light|thin|book|normal)\b/gi,
      " ",
    )
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return { family, weight, style };
}

/** The `@font-face` rule for one uploaded font file. */
export function customFontFace(font: CustomFont): string {
  const ext = font.url.slice(font.url.lastIndexOf(".") + 1).toLowerCase();
  return (
    `@font-face{font-family:"${font.family}";font-style:${font.style};font-display:swap;font-weight:${font.weight};` +
    `src:url("${font.url}") format("${FORMATS[ext] ?? "woff2"}")}`
  );
}

/**
 * The `@font-face` rules a site needs: only for the families its body and
 * heading fonts actually name, so a downloaded site carries the files it uses
 * and no others.
 */
export function siteFontFaces(site: {
  fontFamily?: string | null;
  headingFont?: string | null;
  fonts?: unknown;
}): string {
  const custom = normalizeCustomFonts(site.fonts);
  const rules: string[] = [];
  const done = new Set<string>();
  for (const stack of [site.fontFamily, site.headingFont]) {
    const family = familyOf(stack);
    const key = family.toLowerCase();
    if (!family || done.has(key)) continue;
    done.add(key);
    const bundled = bundledFontFor(stack);
    if (bundled) {
      rules.push(bundledFontFaces(bundled));
      continue;
    }
    for (const font of custom) if (font.family.toLowerCase() === key) rules.push(customFontFace(font));
  }
  return rules.join("\n");
}
