/**
 * Deciding what a stylesheet declaration or a link may say — with no
 * dependencies at all.
 *
 * This used to live in `security.ts`, beside the SVG sanitiser and the upload
 * checks, and that file imports postcss. Two of the callers are client
 * components: the formatting toolbar checks a typed link's scheme, and the
 * inline-text sanitiser runs in the editor. Importing postcss from a client
 * component pulls a Node build tool into the browser bundle — the app's own
 * config names it as a server-external package — and the page it is on stops
 * rendering.
 *
 * So everything that answers a question about a *value* lives here, where it
 * costs nothing to import; everything that needs a real CSS parser (the site's
 * own stylesheet, which is only ever handled on the server) stays next door.
 * The one function that had to change to make that true is
 * `sanitizeStyleAttribute`: a style attribute is a flat list of declarations,
 * and the quote-and-escape-aware scanner below already knows how to walk one,
 * so it splits the list itself rather than asking postcss to.
 */

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
export const ALLOWED_AT_RULES = new Set([
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
 * browser and not to a regular expression. So the attribute is split into its
 * declarations by the quote-and-escape-aware scanner above, and each one is
 * put to the same `declarationIsSafe()` the site's own stylesheet uses.
 */
export function sanitizeStyleAttribute(value: string): string {
  if (!value || !value.trim()) return "";

  const kept: string[] = [];
  for (const declaration of splitDeclarations(value)) {
    const colon = indexOfTopLevelColon(declaration);
    if (colon <= 0) continue;

    const prop = declaration.slice(0, colon).trim();
    let body = declaration.slice(colon + 1).trim();
    if (!prop || !body) continue;

    // `!important` is a modifier, not part of the value.
    let important = false;
    const bang = /\s*!\s*important\s*$/i.exec(body);
    if (bang) {
      important = true;
      body = body.slice(0, bang.index).trim();
    }
    if (!body) continue;

    if (!contentStyleAllows(prop)) continue;
    if (!declarationIsSafe(prop, body)) continue;

    kept.push(`${prop}:${body}${important ? " !important" : ""}`);
  }

  // A `style` attribute is written into an attribute, not into a <style>
  // element, so there is no closing tag to neutralise — but a newline in the
  // middle of a declaration cannot be escaped where this is going, so it goes.
  return kept.join(";").replace(/[\r\n]+/g, " ");
}

/**
 * The declarations in a style attribute, split on the semicolons that actually
 * separate them.
 *
 * Splitting on every `;` is wrong: one can sit inside a quoted string
 * (`content: "a;b"`) or inside a call (`background: url(a;b.png)`), and a
 * backslash escape can hide one anywhere. The same scanner the call reader
 * uses walks past all three.
 */
function splitDeclarations(value: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;

  while (i < value.length) {
    const c = value[i];
    if (c === "\\") { i = readEscape(value, i).end; continue; }
    if (c === '"' || c === "'") { i = endOfString(value, i); continue; }
    if (c === "(") { i = readArgument(value, i).end; continue; }
    if (c === ";") {
      out.push(value.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  out.push(value.slice(start));
  return out.map((d) => d.trim()).filter(Boolean);
}

/** Where a declaration's name ends — the first colon outside a call or string. */
function indexOfTopLevelColon(declaration: string): number {
  let i = 0;
  while (i < declaration.length) {
    const c = declaration[i];
    if (c === "\\") { i = readEscape(declaration, i).end; continue; }
    if (c === '"' || c === "'") { i = endOfString(declaration, i); continue; }
    if (c === "(") { i = readArgument(declaration, i).end; continue; }
    if (c === ":") return i;
    i++;
  }
  return -1;
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
