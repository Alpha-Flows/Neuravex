import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import type { Root } from "postcss";
import tailwindConfig from "../../tailwind.config";
import { cssFunctionCalls, decodeCssEscapes, neutralizeStyleEnd, UNREADABLE_CALL } from "./css-safety";

/**
 * The stylesheet that ships with a downloaded site.
 *
 * Tailwind is run over the exported HTML itself, so the file holds exactly the
 * utilities those pages use and nothing else — a handful of kilobytes rather
 * than the whole application stylesheet. The plain CSS in globals.css comes
 * along too, since the public pages lean on it for the column rules and the
 * template animations.
 */
/**
 * The last few stylesheets that were compiled, by the content that made them.
 *
 * Compiling Tailwind over a twelve-page site costs about 0.85 seconds of CPU,
 * and a download does it every time even when nothing on the site has moved —
 * so a reload of the download button is a second of CPU an anonymous caller
 * can ask for as often as they like. Keyed by a hash of the documents, so a
 * site that has actually changed still compiles.
 */
const CACHE_SIZE = 8;
const cache = new Map<string, string>();

function cacheKey(documents: string[]): string {
  return createHash("sha256").update(documents.join("\u0000")).digest("hex");
}

export async function buildExportCss(documents: string[]): Promise<string> {
  const key = cacheKey(documents);
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Re-inserted so the most recently used entry is the last to go.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const css = await compileExportCss(documents);
  cache.set(key, css);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return css;
}

async function compileExportCss(documents: string[]): Promise<string> {
  const [{ default: postcss }, { default: tailwindcss }] = await Promise.all([
    import("postcss"),
    import("tailwindcss"),
  ]);

  const globals = await readFile(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const result = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: documents.map((raw) => ({ raw, extension: "html" })),
    }),
  ]).process(globals + EXPORT_OVERRIDES, { from: undefined });

  return filterCompiledCss(result.root);
}

/**
 * The compiled stylesheet, with anything that fetches taken out.
 *
 * Tailwind compiles arbitrary values out of `class` attributes, and the HTML
 * sanitiser keeps `class` on every element. A class naming a mask image that
 * points at an attacker's URL is inert in the builder — the builder's own
 * Tailwind is precompiled — and becomes a live rule in the customer's site.
 * `sanitizeCss()` never sees this sheet, because it is generated here rather
 * than written by anyone.
 *
 * Stripping one token is not a fix: any arbitrary property works the same way
 * — a border image, a custom cursor, a generated-content string. And
 * stripping every bracketed class would break the export, because the
 * builder's own components use arbitrary lengths. So the compiled output is
 * what gets judged, one declaration at a time, by the same rule the CSS
 * sanitiser uses: a reference into the same document, or one of this site's
 * own files, or it goes.
 *
 * (Writing those class names out in this comment is itself enough to make
 * Tailwind compile them — the content globs cover src/lib — which is a fair
 * demonstration of how little it takes.)
 */
function filterCompiledCss(root: Root): string {
  root.walkDecls((decl) => {
    if (!exportedDeclarationIsSafe(decl.prop, decl.value)) decl.remove();
  });
  return neutralizeStyleEnd(root.toString());
}

/** Where a compiled rule may point: this archive, or inside the page. */
function referenceIsLocal(reference: string): boolean {
  const value = unquoteCss(decodeCssEscapes(reference)).trim();
  if (!value) return false;
  return (
    value.startsWith("#") ||
    value.startsWith("uploads/") ||
    value.startsWith("stock/") ||
    value.startsWith("./") ||
    /^data:image\//i.test(value)
  );
}

function unquoteCss(value: string): string {
  const v = value.trim();
  return /^["'][\s\S]*["']$/.test(v) ? v.slice(1, -1) : v;
}

function exportedDeclarationIsSafe(prop: string, value: string): boolean {
  // Tailwind writes its generated-content strings into a custom property
  // first, so a content utility carrying a URL shows up there rather than on
  // the `content` property itself.
  if (decodeCssEscapes(prop).trim().toLowerCase() === "--tw-content" && /url\s*\(/i.test(decodeCssEscapes(value))) {
    return false;
  }

  for (const call of cssFunctionCalls(value)) {
    if (call.name === UNREADABLE_CALL) return false;
    if (FETCHING_CALLS.has(call.name) && !referenceIsLocal(call.arg)) return false;
  }
  return true;
}

/** Calls that name something to load. `image-set()` is `url()` in a hat. */
const FETCHING_CALLS = new Set([
  "url", "src",
  "image", "image-set", "-webkit-image-set",
  "cross-fade", "-webkit-cross-fade",
  "element", "paint",
]);

/**
 * globals.css dresses the builder: a dark page behind the canvas, and hover
 * chrome for blocks being edited. A downloaded site is neither, so undo the
 * bits that would follow it out of the app.
 */
const EXPORT_OVERRIDES = `
/* --- added when exporting: this is a site, not the builder UI --- */
:root { color-scheme: light; }
html, body {
  background: #ffffff;
  color: #0f172a;
}
.editor-outline, .editor-toolbar { display: none !important; }
`;
