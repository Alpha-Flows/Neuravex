import { languageKey } from "./code-languages";
import { chunkText, MAX_TEXT_NODE } from "./code-lines";

/**
 * Colour for a code sample, as a list of pieces of text — never as markup.
 *
 * The usual way to do this is a highlighting library that hands back a string
 * of HTML with the spans already in it, which the page then injects. Here that
 * would put the one block whose whole purpose is to show `<script>` exactly as
 * written through `dangerouslySetInnerHTML`, on a page the builder serves and
 * in a file the customer uploads with no policy around it — so a single slip
 * in the library's escaping is a script on somebody's site. It would also be a
 * dependency of tens of kilobytes in the editor bundle, for six languages.
 *
 * So this returns `{ text, kind }` pairs and the component draws each one as a
 * `<span>` with a class for its kind, which React escapes like any other text.
 * Three promises hold whatever the input:
 *
 *   - the texts, joined, are the input exactly — checked on the way out, and a
 *     grammar that got it wrong is answered with the whole sample as plain
 *     text rather than with a sample that lost a character;
 *   - no piece is longer than `MAX_TEXT_NODE`, so none becomes a text node
 *     the browser splits in two under React's feet (see `chunkText`);
 *   - the time taken grows in step with the length of the input, because
 *     this runs on every keystroke in the editor and on every request for a
 *     published page. Every pattern is anchored where the scan stands (the
 *     `y` flag) and either consumes what it reads or reads no further than
 *     the end of the line it starts on.
 *
 * The last promise was not kept by the first version, which said it was. A
 * `/` that might open a regular expression reads ahead to the end of its line
 * looking for the closing one, and when there is none, that read is thrown
 * away. It was repeated at every `/` on the line, so `/[` written fifteen
 * thousand times took 450 ms to colour, ten such samples held a published
 * page for 6.5 seconds, and a keystroke on the canvas took one. A regular
 * expression that fails to close is now tried once per line: after it, a `/`
 * on the same line is only ever a division.
 *
 * It is a scanner, not a parser. It knows a comment, a string, a number, a
 * keyword, a call, a tag and an attribute, which is what a reader's eye uses;
 * it does not know what an expression is. Where a language is ambiguous
 * without one — a `/` that starts a regular expression or divides — it
 * guesses from the token before, as editors do, and a wrong guess colours one
 * line oddly and changes nothing else.
 */

export type TokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "function"
  | "tag"
  | "attr"
  | "property"
  | "variable";

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

/**
 * Past this many characters a sample is drawn in one colour. A log or a
 * minified file pasted into a documentation page is not read for its colours,
 * and scanning it on every keystroke is where the editor would start to lag.
 */
export const MAX_HIGHLIGHT = 30_000;

/** Tokens built up with neighbours of the same kind merged, so a line of prose is one text node, not forty. */
class TokenList {
  readonly tokens: CodeToken[] = [];

  push(text: string, kind: TokenKind): void {
    if (!text) return;
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else this.tokens.push({ text, kind });
  }
}

/** The text a sticky pattern matches where the scan stands, or null. An empty match counts as none. */
function at(pattern: RegExp, code: string, index: number): string | null {
  pattern.lastIndex = index;
  const m = pattern.exec(code);
  return m && m[0] ? m[0] : null;
}

/** Where the line holding `index` ends: its newline, or the end of the sample. */
function lineEnd(code: string, index: number): number {
  const newline = code.indexOf("\n", index);
  return newline === -1 ? code.length : newline;
}

/** One character, or both halves of a surrogate pair — never half an emoji in one span and half in the next. */
function oneChar(code: string, index: number): string {
  const unit = code.charCodeAt(index);
  return unit >= 0xd800 && unit <= 0xdbff && index + 1 < code.length ? code.slice(index, index + 2) : code[index];
}

const WHITESPACE = /\s+/y;
const LINE_COMMENT = /\/\/[^\n]*/y;
// `$` without the `m` flag is the end of the whole sample, so a comment that is
// never closed runs to the end, which is what the language does with it too.
const BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/y;
// A string stops at the end of its line when it is not closed there: one
// stray quote colours one line, not the rest of the sample.
const QUOTED = /"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?/y;
const OPENS_CALL = /\s*\(/y;

// ---------------------------------------------------------------------------
// JavaScript and TypeScript
// ---------------------------------------------------------------------------

const JS_KEYWORDS = [
  "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "export", "extends", "finally", "for", "from", "function", "if", "import",
  "in", "instanceof", "let", "new", "of", "return", "static", "super", "switch", "this", "throw",
  "try", "typeof", "var", "void", "while", "with", "yield", "as",
];
const TS_KEYWORDS = [
  ...JS_KEYWORDS,
  "abstract", "any", "bigint", "boolean", "declare", "enum", "implements", "infer", "interface",
  "is", "keyof", "namespace", "never", "number", "object", "override", "private", "protected",
  "public", "readonly", "satisfies", "string", "symbol", "type", "unknown",
];
const JS_SET = new Set(JS_KEYWORDS);
const TS_SET = new Set(TS_KEYWORDS);
const JS_LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

/**
 * What can come right before a regular expression, as opposed to a division.
 * `prev` is the last token that was not space or a comment, and a run of
 * punctuation is remembered by its last character — so `=>` is `>`.
 */
const EXPRESSION_START = new Set([
  "", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^",
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else",
  "yield", "await",
]);

// A class is written out in full or not at all, and the branches start on
// different characters, so there is nothing for the engine to retry. A
// pattern starting `/>` is left alone: in JSX that is the end of a tag.
const JS_REGEX = /\/(?![*/>])(?:[^\\/\n[]|\\[^\n]|\[(?:[^\\\]\n]|\\[^\n])*\])+\/[a-z]*/y;
const TEMPLATE = /`(?:[^`\\]|\\[\s\S])*`?/y;
const JS_NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)n?/y;
const JS_IDENT = /[A-Za-z_$À-￿][\w$À-￿]*/y;
const DECORATOR = /@[A-Za-z_$][\w$]*/y;
const JSX_OPEN = /<[A-Za-z][\w.:-]*/y;
const JSX_FRAGMENT = /<>/y;
const JSX_CLOSE = /<\/(?:[A-Za-z][\w.:-]*\s*>?|>)/y;
const JSX_TAG_END = /\/?>/y;
const JSX_ATTR = /[A-Za-z_$][\w$.:-]*/y;
const JSX_TEXT = /[^<{]+/y;
/** What `prev` is set to when a JSX element has just closed: a value, after which another element may follow. */
const AFTER_ELEMENT = "\u0000element";

/**
 * Where the scan is inside JSX. Between a tag's name and its `>` it reads
 * attributes; between an element's tags it reads text, which is prose and not
 * code — `<p>Don't panic</p>` used to open a string at the apostrophe that ran
 * to the end of the line and swallowed the closing tag with it; inside `{ }`
 * it reads script again, until the brace that closes it.
 */
type JsxFrame = { mode: "attrs" } | { mode: "children" } | { mode: "expr"; depth: number };

function scanScript(code: string, out: TokenList, keywords: Set<string>, jsx: boolean): void {
  let i = 0;
  let prev = "";
  // A `/` before this point on the current line has already failed to be a
  // regular expression, so every later one on the line is a division — see
  // the note at the top of this file on what trying each of them again cost.
  let noRegexBefore = -1;
  const regexAt = (index: number): string | null => {
    const found = at(JS_REGEX, code, index);
    if (!found) noRegexBefore = lineEnd(code, index);
    return found;
  };
  const stack: JsxFrame[] = [];

  while (i < code.length) {
    const frame = stack[stack.length - 1];
    let text: string | null;

    if (frame?.mode === "attrs") {
      if ((text = at(WHITESPACE, code, i))) {
        out.push(text, "plain");
      } else if ((text = at(JSX_TAG_END, code, i))) {
        out.push(text, "tag");
        stack.pop();
        if (text === ">") stack.push({ mode: "children" });
        else prev = AFTER_ELEMENT;
      } else if ((text = at(JSX_ATTR, code, i))) {
        out.push(text, "attr");
      } else if ((text = at(QUOTED, code, i))) {
        out.push(text, "string");
      } else if (code[i] === "=" || code[i] === "{") {
        text = code[i];
        out.push(text, "plain");
        if (text === "{") {
          stack.push({ mode: "expr", depth: 1 });
          prev = "{";
        }
      } else {
        // Nothing an attribute list holds, so this was never a tag — a
        // TypeScript `<T,>` in a .tsx file, say. The enclosing mode reads
        // this character instead.
        stack.pop();
        continue;
      }
      i += text.length;
      continue;
    }

    if (frame?.mode === "children") {
      if ((text = at(JSX_CLOSE, code, i))) {
        out.push(text, "tag");
        stack.pop();
        prev = AFTER_ELEMENT;
      } else if ((text = at(JSX_FRAGMENT, code, i))) {
        out.push(text, "tag");
        stack.push({ mode: "children" });
      } else if ((text = at(JSX_OPEN, code, i))) {
        out.push(text, "tag");
        stack.push({ mode: "attrs" });
      } else if (code[i] === "{") {
        text = "{";
        out.push(text, "plain");
        stack.push({ mode: "expr", depth: 1 });
        prev = "{";
      } else {
        text = at(JSX_TEXT, code, i) ?? oneChar(code, i);
        out.push(text, "plain");
      }
      i += text.length;
      continue;
    }

    // Script, at the top or inside `{ }` in JSX.
    const opensElement = jsx && (EXPRESSION_START.has(prev) || prev === AFTER_ELEMENT);
    if ((text = at(WHITESPACE, code, i))) {
      out.push(text, "plain");
    } else if ((text = at(LINE_COMMENT, code, i) ?? at(BLOCK_COMMENT, code, i))) {
      out.push(text, "comment");
    } else if ((text = at(QUOTED, code, i) ?? at(TEMPLATE, code, i))) {
      out.push(text, "string");
      prev = text;
    } else if (code[i] === "/" && i >= noRegexBefore && EXPRESSION_START.has(prev) && (text = regexAt(i))) {
      out.push(text, "string");
      prev = text;
    } else if (jsx && (text = at(JSX_CLOSE, code, i))) {
      // A closing tag with no element open here: a snippet that starts in
      // the middle of one.
      out.push(text, "tag");
      prev = AFTER_ELEMENT;
    } else if (opensElement && (text = at(JSX_FRAGMENT, code, i))) {
      out.push(text, "tag");
      stack.push({ mode: "children" });
    } else if (opensElement && (text = at(JSX_OPEN, code, i))) {
      out.push(text, "tag");
      stack.push({ mode: "attrs" });
    } else if (frame?.mode === "expr" && (code[i] === "{" || code[i] === "}")) {
      text = code[i];
      out.push(text, "plain");
      frame.depth += text === "{" ? 1 : -1;
      if (frame.depth === 0) stack.pop();
      prev = text;
    } else if ((text = at(JS_NUMBER, code, i))) {
      out.push(text, "number");
      prev = text;
    } else if ((text = at(DECORATOR, code, i))) {
      out.push(text, "keyword");
      prev = text;
    } else if ((text = at(JS_IDENT, code, i))) {
      // After a dot it is a property, whatever it is called: `node.type`,
      // `promise.catch`, `options.default`.
      const member = prev === ".";
      const end = i + text.length;
      const kind: TokenKind =
        !member && keywords.has(text) ? "keyword"
        : !member && JS_LITERALS.has(text) ? "number"
        : prev === "function" || prev === "class" || at(OPENS_CALL, code, end) ? "function"
        : "plain";
      out.push(text, kind);
      prev = text;
    } else {
      text = oneChar(code, i);
      out.push(text, "plain");
      prev = text;
    }
    i += text.length;
  }
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else",
  "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);
const PY_LITERALS = new Set(["True", "False", "None"]);
const PY_SELF = new Set(["self", "cls"]);
const PY_COMMENT = /#[^\n]*/y;
const PY_STRING =
  /(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?)/y;
const PY_NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[jJ]?/y;
const PY_IDENT = /[A-Za-z_À-￿][\wÀ-￿]*/y;
const PY_DECORATOR = /@[A-Za-z_][\w.]*/y;

function scanPython(code: string, out: TokenList): void {
  let i = 0;
  let prev = "";
  while (i < code.length) {
    let text: string | null;
    if ((text = at(WHITESPACE, code, i))) {
      out.push(text, "plain");
    } else if ((text = at(PY_COMMENT, code, i))) {
      out.push(text, "comment");
    } else if ((text = at(PY_STRING, code, i))) {
      out.push(text, "string");
      prev = text;
    } else if ((text = at(PY_NUMBER, code, i))) {
      out.push(text, "number");
      prev = text;
    } else if ((text = at(PY_DECORATOR, code, i))) {
      out.push(text, "function");
      prev = text;
    } else if ((text = at(PY_IDENT, code, i))) {
      const member = prev === ".";
      const kind: TokenKind =
        !member && PY_KEYWORDS.has(text) ? "keyword"
        : !member && PY_LITERALS.has(text) ? "number"
        : !member && PY_SELF.has(text) ? "variable"
        : prev === "def" || prev === "class" || at(OPENS_CALL, code, i + text.length) ? "function"
        : "plain";
      out.push(text, kind);
      prev = text;
    } else {
      text = oneChar(code, i);
      out.push(text, "plain");
      prev = text;
    }
    i += text.length;
  }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/** Words that are keywords where a command would be — `if` is a command called `if` anywhere else. */
const SH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "until", "case", "esac",
  "function", "select", "return", "time", "export", "local", "readonly", "declare", "unset",
]);
/**
 * Words after which another command follows. `sudo` is a command itself, but
 * in `sudo apt install` the one the reader is looking for is `apt`.
 */
const SH_LEADS_TO_COMMAND = new Set(["if", "then", "else", "elif", "do", "while", "until", "time", "sudo", "exec"]);

const SH_CONTINUATION = /\\\n/y;
const SH_BLANK = /[ \t]+/y;
const SH_ESCAPE = /\\[\s\S]/y;
const SH_COMMENT = /#[^\n]*/y;
const SH_PROMPT = /\$(?=[ \t])/y;
const SH_SINGLE = /'[^']*'?/y;
const SH_ANSI = /\$'(?:[^'\\]|\\[\s\S])*'?/y;
const SH_DOUBLE = /"(?:[^"\\]|\\[\s\S])*"?/y;
const SH_VARIABLE = /\$\{[^}\n]*\}?|\$[A-Za-z_]\w*|\$[0-9@#?$!*-]/y;
const SH_SUBSHELL = /\$\(|`/y;
const SH_OPERATOR = /&&|\|\||;;|[|;&()]|[{}](?=\s|$)/y;
const SH_REDIRECT = /\d*[<>]+&?\d*/y;
// `<<EOF`, `<<-EOF`, `<<'EOF'`: the lines after this one, up to the word on
// a line of its own, are text handed to the command, not more commands.
const SH_HEREDOC = /<<(-?)[ \t]*(['"]?)([A-Za-z_][\w-]*)\2/y;
const SH_OPTION = /--?[A-Za-z0-9][\w-]*/y;
const SH_ASSIGNMENT = /[A-Za-z_]\w*(?==)/y;
const SH_WORD = /[^\s|&;()<>"'$`\\]+/y;

function scanShell(code: string, out: TokenList): void {
  let i = 0;
  // Whether the next word names a command — the start of a line, after a
  // pipe or `&&`, inside `$( )`. That is the word worth colouring: in
  // `npm install --save`, the reader is looking for `npm`.
  let command = true;
  // Whether the scan is at the start of a word, which is the only place a
  // `#` begins a comment (`a#b` is one word) and a `-` begins an option.
  let wordStart = true;
  let lineStart = true;
  // Here-documents opened on the current line, read once it ends.
  const heredocs: { word: string; tabs: boolean }[] = [];
  while (i < code.length) {
    let text: string | null;
    if ((text = at(SH_CONTINUATION, code, i))) {
      out.push(text, "plain");
      wordStart = true;
    } else if (code[i] === "\n") {
      out.push("\n", "plain");
      command = wordStart = lineStart = true;
      i += 1;
      for (const { word, tabs } of heredocs.splice(0)) {
        const end = new RegExp(`^${tabs ? "\\t*" : ""}${word}[ \\t]*$`, "mg");
        end.lastIndex = i;
        const found = end.exec(code);
        const bodyEnd = found ? found.index : code.length;
        out.push(code.slice(i, bodyEnd), "string");
        if (found) out.push(found[0], "keyword");
        i = found ? found.index + found[0].length : code.length;
      }
      continue;
    } else if ((text = at(SH_BLANK, code, i))) {
      out.push(text, "plain");
      wordStart = true;
    } else if ((text = at(SH_ESCAPE, code, i))) {
      out.push(text, "plain");
      wordStart = lineStart = false;
    } else if (wordStart && (text = at(SH_COMMENT, code, i))) {
      out.push(text, "comment");
    } else if (lineStart && (text = at(SH_PROMPT, code, i))) {
      // `$ npm install` in a transcript: the prompt is not part of what to type.
      out.push(text, "comment");
    } else if ((text = at(SH_SINGLE, code, i) ?? at(SH_ANSI, code, i) ?? at(SH_DOUBLE, code, i))) {
      out.push(text, "string");
      command = wordStart = lineStart = false;
    } else if ((text = at(SH_SUBSHELL, code, i))) {
      out.push(text, "variable");
      command = wordStart = true;
      lineStart = false;
    } else if ((text = at(SH_VARIABLE, code, i))) {
      out.push(text, "variable");
      wordStart = lineStart = false;
    } else if ((text = at(SH_OPERATOR, code, i))) {
      out.push(text, "plain");
      command = text !== ")" && text !== "}";
      wordStart = true;
      lineStart = false;
    } else if ((text = at(SH_HEREDOC, code, i))) {
      out.push(text, "keyword");
      SH_HEREDOC.lastIndex = i;
      const [, dash, , word] = SH_HEREDOC.exec(code) ?? [];
      heredocs.push({ word, tabs: dash === "-" });
      wordStart = true;
      lineStart = false;
    } else if ((text = at(SH_REDIRECT, code, i))) {
      out.push(text, "plain");
      wordStart = true;
      lineStart = false;
    } else if (wordStart && command && (text = at(SH_ASSIGNMENT, code, i))) {
      // `NODE_ENV=production npm start`: the next word is still the command.
      out.push(text, "variable");
      wordStart = lineStart = false;
    } else if (wordStart && !command && (text = at(SH_OPTION, code, i))) {
      out.push(text, "attr");
      wordStart = lineStart = false;
    } else if ((text = at(SH_WORD, code, i))) {
      if (wordStart && command) {
        out.push(text, SH_KEYWORDS.has(text) ? "keyword" : "function");
        command = SH_LEADS_TO_COMMAND.has(text);
      } else {
        out.push(text, "plain");
      }
      wordStart = lineStart = false;
    } else {
      text = oneChar(code, i);
      out.push(text, "plain");
      wordStart = lineStart = false;
    }
    i += text.length;
  }
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

const JSON_STRING = /"(?:[^"\\\n]|\\[^\n])*"?/y;
const JSON_KEY_FOLLOWS = /\s*:/y;
const JSON_NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const JSON_WORD = /[A-Za-z_$][\w$]*/y;

function scanJson(code: string, out: TokenList): void {
  let i = 0;
  while (i < code.length) {
    let text: string | null;
    if ((text = at(WHITESPACE, code, i))) {
      out.push(text, "plain");
    } else if ((text = at(LINE_COMMENT, code, i) ?? at(BLOCK_COMMENT, code, i))) {
      // Not JSON, strictly — but a config file with comments is labelled JSON
      // in every piece of documentation that shows one.
      out.push(text, "comment");
    } else if ((text = at(JSON_STRING, code, i))) {
      out.push(text, at(JSON_KEY_FOLLOWS, code, i + text.length) ? "property" : "string");
    } else if ((text = at(JSON_NUMBER, code, i))) {
      out.push(text, "number");
    } else if ((text = at(JSON_WORD, code, i))) {
      out.push(text, JS_LITERALS.has(text) ? "number" : "plain");
    } else {
      text = oneChar(code, i);
      out.push(text, "plain");
    }
    i += text.length;
  }
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS_AT_RULE = /@[\w-]+/y;
const CSS_IMPORTANT = /![ \t]*important\b/iy;
/** Whether the statement starting here is a selector (it reaches a `{` before a `;` or `}`). */
const CSS_OPENS_BLOCK = /[^;{}]*\{/y;
const CSS_PROPERTY = /-{0,2}[A-Za-z_][\w-]*/y;
const CSS_HEX = /#[\da-fA-F]{3,8}(?![\w-])/y;
const CSS_NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[A-Za-z]+)?/y;
const CSS_FUNCTION = /-?[A-Za-z_][\w-]*(?=\()/y;
const CSS_IDENT = /-{0,2}[A-Za-z_][\w-]*/y;
const CSS_SELECTOR = /[.#]?-?[A-Za-z_][\w-]*/y;
const CSS_PSEUDO = /::?-?[A-Za-z_][\w-]*/y;

function scanCss(code: string, out: TokenList): void {
  let i = 0;
  // What the current statement is: a selector before `{`, a declaration
  // inside one, or the rest of an at-rule's line. Decided when its first
  // word is reached, by whether a `{` comes before the next `;` or `}` —
  // `a:hover {` and `color: red;` both open with a word and a colon.
  let mode: "selector" | "declaration" | "prelude" = "selector";
  let fresh = true;
  let afterColon = false;
  while (i < code.length) {
    let text: string | null;
    if ((text = at(WHITESPACE, code, i))) {
      out.push(text, "plain");
      i += text.length;
      continue;
    }
    if ((text = at(BLOCK_COMMENT, code, i))) {
      out.push(text, "comment");
      i += text.length;
      continue;
    }
    const c = code[i];
    if (c === "{" || c === "}" || c === ";") {
      out.push(c, "plain");
      fresh = true;
      afterColon = false;
      i += 1;
      continue;
    }
    if (fresh) {
      fresh = false;
      mode = at(CSS_AT_RULE, code, i) ? "prelude" : at(CSS_OPENS_BLOCK, code, i) ? "selector" : "declaration";
    }

    if ((text = at(QUOTED, code, i))) {
      out.push(text, "string");
    } else if ((text = at(CSS_AT_RULE, code, i))) {
      out.push(text, "keyword");
    } else if ((text = at(CSS_IMPORTANT, code, i))) {
      out.push(text, "keyword");
    } else if (mode === "selector") {
      if ((text = at(CSS_PSEUDO, code, i))) out.push(text, "keyword");
      else if ((text = at(CSS_SELECTOR, code, i))) out.push(text, "tag");
      else out.push((text = oneChar(code, i)), "plain");
    } else if (mode === "declaration" && !afterColon && (text = at(CSS_PROPERTY, code, i))) {
      out.push(text, "property");
    } else if (mode === "declaration" && !afterColon && c === ":") {
      text = c;
      out.push(text, "plain");
      afterColon = true;
    } else if ((text = at(CSS_HEX, code, i) ?? at(CSS_NUMBER, code, i))) {
      out.push(text, "number");
    } else if ((text = at(CSS_FUNCTION, code, i))) {
      out.push(text, "function");
    } else if ((text = at(CSS_IDENT, code, i))) {
      out.push(text, "plain");
    } else {
      out.push((text = oneChar(code, i)), "plain");
    }
    i += text.length;
  }
}

// ---------------------------------------------------------------------------
// HTML (and XML, SVG)
// ---------------------------------------------------------------------------

const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/y;
const HTML_DECLARATION = /<![A-Za-z[][^>]*>?/y;
const HTML_TAG_OPEN = /<\/?[A-Za-z][\w:.-]*/y;
const HTML_TAG_END = /\/?>/y;
const HTML_ATTR = /[^\s"'>/=]+/y;
const HTML_QUOTED_VALUE = /"[^"]*"?|'[^']*'?/y;
const HTML_BARE_VALUE = /[^\s"'=<>`]+/y;
const HTML_ENTITY = /&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][A-Za-z\d]*);/y;
const HTML_TEXT = /[^<&]+/y;

function scanHtml(code: string, out: TokenList): void {
  let i = 0;
  while (i < code.length) {
    let text: string | null;
    if ((text = at(HTML_COMMENT, code, i))) {
      out.push(text, "comment");
      i += text.length;
    } else if ((text = at(HTML_DECLARATION, code, i))) {
      out.push(text, "keyword");
      i += text.length;
    } else if ((text = at(HTML_TAG_OPEN, code, i))) {
      out.push(text, "tag");
      i += text.length;
      const name = text.slice(1).toLowerCase();
      let closed = "";
      let afterEquals = false;
      while (i < code.length) {
        let part: string | null;
        if ((part = at(WHITESPACE, code, i))) {
          out.push(part, "plain");
        } else if ((part = at(HTML_TAG_END, code, i))) {
          out.push(part, "tag");
          closed = part;
          i += part.length;
          break;
        } else if (code[i] === "=") {
          part = "=";
          out.push(part, "plain");
          afterEquals = true;
          i += 1;
          continue;
        } else if ((part = at(HTML_QUOTED_VALUE, code, i) ?? (afterEquals ? at(HTML_BARE_VALUE, code, i) : null))) {
          out.push(part, "string");
        } else if ((part = at(HTML_ATTR, code, i))) {
          out.push(part, "attr");
        } else {
          part = oneChar(code, i);
          out.push(part, "plain");
        }
        afterEquals = false;
        i += part.length;
      }
      // The inside of a script or a style element is not HTML — `if (a < b)`
      // would otherwise open a tag called `b` — so it is handed to the
      // language it is written in, up to the tag that closes it.
      if (closed === ">" && (name === "script" || name === "style")) {
        const closer = new RegExp(`</${name}(?=[\\s>/]|$)`, "gi");
        closer.lastIndex = i;
        const found = closer.exec(code);
        const end = found ? found.index : code.length;
        const inner = code.slice(i, end);
        if (name === "script") scanScript(inner, out, JS_SET, false);
        else scanCss(inner, out);
        i = end;
      }
    } else if ((text = at(HTML_ENTITY, code, i))) {
      out.push(text, "number");
      i += text.length;
    } else if ((text = at(HTML_TEXT, code, i))) {
      out.push(text, "plain");
      i += text.length;
    } else {
      text = oneChar(code, i);
      out.push(text, "plain");
      i += text.length;
    }
  }
}

// ---------------------------------------------------------------------------
// Which scanner a language gets
// ---------------------------------------------------------------------------

type Scanner = (code: string, out: TokenList) => void;

const javascript: Scanner = (code, out) => scanScript(code, out, JS_SET, false);
const jsx: Scanner = (code, out) => scanScript(code, out, JS_SET, true);
const typescript: Scanner = (code, out) => scanScript(code, out, TS_SET, false);
const tsx: Scanner = (code, out) => scanScript(code, out, TS_SET, true);

/**
 * The names a language goes by. The panel only offers the first of each, but
 * a sample pasted in by an agent, or imported, says "sh" or "py" as often.
 */
const SCANNERS: Record<string, Scanner> = {
  javascript, js: javascript, mjs: javascript, cjs: javascript, node: javascript,
  jsx,
  typescript, ts: typescript, mts: typescript, cts: typescript,
  tsx,
  css: scanCss,
  html: scanHtml, htm: scanHtml, xhtml: scanHtml, xml: scanHtml, svg: scanHtml, vue: scanHtml, svelte: scanHtml,
  bash: scanShell, sh: scanShell, shell: scanShell, zsh: scanShell, console: scanShell, terminal: scanShell,
  json: scanJson, jsonc: scanJson, json5: scanJson,
  python: scanPython, py: scanPython,
};

/** Whether a language gets colours here, rather than only a label. */
export function canHighlight(language: string | undefined | null): boolean {
  return Object.prototype.hasOwnProperty.call(SCANNERS, languageKey(language));
}

/** Pieces cut down to what one text node can hold. */
function capped(tokens: CodeToken[]): CodeToken[] {
  if (tokens.every((t) => t.text.length <= MAX_TEXT_NODE)) return tokens;
  return tokens.flatMap((t) => chunkText(t.text).map((text) => ({ text, kind: t.kind })));
}

/**
 * A sample as coloured pieces. The pieces always join back into `code`
 * exactly, and none is longer than `MAX_TEXT_NODE`; neighbours of one kind
 * are only left apart where joining them would break that.
 */
export function highlight(code: string, language: string | undefined | null): CodeToken[] {
  if (typeof code !== "string" || code === "") return [];
  const plain = capped([{ text: code, kind: "plain" }]);
  if (code.length > MAX_HIGHLIGHT || !canHighlight(language)) return plain;

  const out = new TokenList();
  try {
    SCANNERS[languageKey(language)](code, out);
  } catch {
    // Nothing above should throw. If a future edit makes one, the reader
    // still gets the sample, in one colour.
    return plain;
  }
  let joined = "";
  for (const token of out.tokens) joined += token.text;
  return joined === code ? capped(out.tokens) : plain;
}
