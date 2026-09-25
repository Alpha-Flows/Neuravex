import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { normalizeBlockTree, safeProps } from "@/lib/block-tree";
import { getBlockDefinition } from "@/lib/blocks";
import { highlight, canHighlight, MAX_HIGHLIGHT, type CodeToken, type TokenKind } from "@/lib/code-highlight";
import { CODE_LANGUAGES, isPlainLanguage, languageLabel } from "@/lib/code-languages";
import {
  chunkText, indentCode, lineCount, MAX_CODE, MAX_TEXT_NODE, needsTrailingLine, splitTokenLines,
} from "@/lib/code-lines";
import { collectLocalAssets, rewriteAssetPaths } from "@/lib/static-export";

const code = (props: unknown) => ({ id: "c", type: "code", props });

function stored(props: unknown): Record<string, unknown> {
  const result = normalizeBlockTree([code(props)]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.tree[0].props;
}

const joined = (tokens: CodeToken[]) => tokens.map((t) => t.text).join("");
/** The kind each piece of text was given, for pieces that are not plain. */
const kinds = (tokens: CodeToken[]) =>
  tokens.filter((t) => t.kind !== "plain").map((t) => [t.text, t.kind] as [string, TokenKind]);
const kindOf = (tokens: CodeToken[], text: string) => tokens.find((t) => t.text === text)?.kind;

describe("the code prop", () => {
  it("is stored as written, markup included — it is shown escaped, never sanitised", () => {
    // Sanitising would change the sample. What makes it safe is that React
    // writes it out as text, which the component test below pins.
    const sample = '<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n&amp; a < b && c > d';
    expect(stored({ code: sample }).code).toBe(sample);
  });

  it("keeps indentation, tabs and trailing space exactly", () => {
    const sample = "function f() {\n\treturn 1;   \n  }\n\n\n";
    expect(stored({ code: sample }).code).toBe(sample);
  });

  it("makes every line ending a newline, the only one a text box reports", () => {
    expect(stored({ code: "a\r\nb\rc\n" }).code).toBe("a\nb\nc\n");
  });

  it("cuts an over-long sample to length instead of emptying it", () => {
    const long = "x".repeat(150_000);
    const kept = stored({ code: long }).code as string;
    expect(kept.length).toBe(MAX_CODE);
    expect(long.startsWith(kept)).toBe(true);
  });

  it("stores a sample exactly at the limit untouched, so the text box and the schema agree", () => {
    // The text boxes stop at MAX_CODE. If the schema cut shorter, a sample at
    // the limit would lose its last character on every render.
    const full = "y".repeat(MAX_CODE);
    expect(stored({ code: full }).code).toBe(full);
    expect(MAX_CODE).toBe(100_000);
  });

  it("repairs a code prop that is not text", () => {
    for (const bad of [42, null, ["a"], { a: 1 }, undefined]) expect(stored({ code: bad }).code).toBe("");
  });

  it("repairs the settings one at a time", () => {
    const props = stored({
      code: "ok",
      language: "  Rust  ",
      filename: "src/\nmain.rs",
      theme: "purple",
      wrap: "yes",
      lineNumbers: 1,
    });
    expect(props).toEqual({
      code: "ok",
      language: "Rust",
      filename: "src/ main.rs",
      theme: "dark",
      wrap: false,
      lineNumbers: false,
    });
  });

  it("keeps a light theme, wrapping and line numbers that were asked for", () => {
    const props = stored({ code: "", theme: "light", wrap: true, lineNumbers: true });
    expect([props.theme, props.wrap, props.lineNumbers]).toEqual(["light", true, true]);
  });

  it("caps the language and the file name", () => {
    const props = stored({ language: "l".repeat(100), filename: "f".repeat(500) });
    expect((props.language as string).length).toBe(40);
    expect((props.filename as string).length).toBe(200);
  });

  it("stores the palette's default sample unchanged, and highlights it", () => {
    const defaults = getBlockDefinition("code")!.defaultProps;
    expect(stored(defaults)).toEqual(defaults);
    expect(safeProps("code", defaults, null)).toEqual(defaults);
    expect(kinds(highlight(defaults.code, defaults.language)).length).toBeGreaterThan(0);
  });
});

describe("the component", () => {
  // The code, with its comments taken out: those are allowed to name what the
  // code does not do.
  const source = readFileSync(join(process.cwd(), "src/components/blocks/CodeBlock.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("never injects markup — the sample is only ever text React escapes", () => {
    expect(source).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });

  it("puts no author text into an attribute it does not need", () => {
    expect(source).not.toMatch(/data-language/);
  });

  it("holds both text boxes to the stored limit", () => {
    const panel = readFileSync(join(process.cwd(), "src/components/editor/inspectors/CodePanel.tsx"), "utf8");
    expect(source).toMatch(/maxLength=\{MAX_CODE\}/);
    expect(panel).toMatch(/maxLength=\{MAX_CODE\}/);
  });

  it("edits a plain text box, not a contentEditable that would sanitise the code", () => {
    expect(source).toMatch(/<textarea/);
    expect(source).not.toMatch(/contentEditable|<Editable/);
  });
});

describe("lines", () => {
  it("counts lines the way a text box does", () => {
    expect(lineCount("")).toBe(1);
    expect(lineCount("a")).toBe(1);
    expect(lineCount("a\n")).toBe(2);
    expect(lineCount("a\n\nb")).toBe(3);
  });

  it("splits tokens into lines, with a multi-line token cut at each newline", () => {
    const lines = splitTokenLines([
      { text: "a ", kind: "plain" },
      { text: "/* one\ntwo */", kind: "comment" },
      { text: "\n\n", kind: "plain" },
      { text: "b", kind: "keyword" },
    ]);
    expect(lines).toEqual([
      [{ text: "a ", kind: "plain" }, { text: "/* one", kind: "comment" }],
      [{ text: "two */", kind: "comment" }],
      [],
      [{ text: "b", kind: "keyword" }],
    ]);
  });

  it("gives n newlines n + 1 lines, a trailing one included", () => {
    for (const sample of ["", "a", "a\n", "\n\n", "x\ny\n\n"]) {
      expect(splitTokenLines(highlight(sample, "javascript"))).toHaveLength(lineCount(sample));
    }
  });

  it("cuts long text into pieces a text node can hold, at newlines where it can", () => {
    expect(chunkText("short")).toEqual(["short"]);
    const lines = "0123456789\n".repeat(10_000);
    const pieces = chunkText(lines);
    expect(pieces.join("")).toBe(lines);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(MAX_TEXT_NODE);
      expect(piece.endsWith("\n")).toBe(true);
    }
  });

  it("cuts a single enormous line where it must, never between surrogate halves", () => {
    // The emoji's first half lands exactly on the boundary.
    const line = "a".repeat(MAX_TEXT_NODE - 1) + "😀" + "b".repeat(MAX_TEXT_NODE * 2);
    const pieces = chunkText(line);
    expect(pieces.join("")).toBe(line);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(MAX_TEXT_NODE);
      expect(piece).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  it("adds a line to the drawing only where the text box would show one more", () => {
    expect(needsTrailingLine("")).toBe(true);
    expect(needsTrailingLine("a\n")).toBe(true);
    expect(needsTrailingLine("a")).toBe(false);
  });
});

describe("Tab and Shift+Tab", () => {
  it("puts two spaces at the caret", () => {
    expect(indentCode("ab", 1, 1, false)).toEqual({ value: "a  b", start: 3, end: 3 });
  });

  it("replaces a selection inside one line", () => {
    expect(indentCode("abcd", 1, 3, false)).toEqual({ value: "a  d", start: 3, end: 3 });
  });

  it("indents every line a selection crosses, and keeps them selected", () => {
    const value = "one\ntwo\nthree";
    const edit = indentCode(value, 1, 6, false);
    expect(edit.value).toBe("  one\n  two\nthree");
    expect(edit.value.slice(edit.start, edit.end)).toBe("ne\n  tw");
  });

  it("keeps a selection that starts at column 0 there, spaces included", () => {
    const edit = indentCode("one\ntwo", 0, 7, false);
    expect(edit.value).toBe("  one\n  two");
    expect(edit.value.slice(edit.start, edit.end)).toBe("  one\n  two");
  });

  it("leaves out the line a selection only reaches the start of", () => {
    const edit = indentCode("one\ntwo\nthree", 0, 8, false);
    expect(edit.value).toBe("  one\n  two\nthree");
    expect(edit.end).toBe(12);
  });

  it("outdents the caret's line, and the caret with it", () => {
    expect(indentCode("    x", 4, 4, true)).toEqual({ value: "  x", start: 2, end: 2 });
    expect(indentCode("\tx", 2, 2, true)).toEqual({ value: "x", start: 1, end: 1 });
    // A caret inside the spaces being removed lands where they began.
    expect(indentCode("  x", 1, 1, true)).toEqual({ value: "x", start: 0, end: 0 });
  });

  it("outdents every line a selection crosses by what each one has", () => {
    const edit = indentCode("    a\n b\nc\n  d", 0, 14, true);
    expect(edit.value).toBe("  a\nb\nc\nd");
    expect(edit).toMatchObject({ start: 0, end: edit.value.length });
  });

  it("changes nothing when there is nothing to outdent", () => {
    expect(indentCode("abc", 2, 2, true)).toEqual({ value: "abc", start: 2, end: 2 });
  });

  it("copes with a selection given backwards or out of range", () => {
    expect(indentCode("ab", 5, -3, false).value).toBe("  ");
    expect(indentCode("ab", 2, 0, false)).toEqual({ value: "  ", start: 2, end: 2 });
  });
});

describe("the highlighter", () => {
  const LANGUAGES = ["javascript", "typescript", "jsx", "tsx", "css", "html", "bash", "json", "python"];

  it("answers every language it offers colour for", () => {
    for (const language of LANGUAGES) expect(canHighlight(language)).toBe(true);
    for (const alias of ["js", "ts", "sh", "shell", "py", "xml", "svg", "jsonc"]) expect(canHighlight(alias)).toBe(true);
    for (const other of ["", "php", "rust", "nonsense", "__proto__", "constructor", "toString"]) {
      expect(canHighlight(other)).toBe(false);
    }
  });

  it("returns nothing for nothing, and one plain piece for a language it does not know", () => {
    expect(highlight("", "javascript")).toEqual([]);
    expect(highlight("<?php echo 1; ?>", "php")).toEqual([{ text: "<?php echo 1; ?>", kind: "plain" }]);
    expect(highlight("x", "constructor")).toEqual([{ text: "x", kind: "plain" }]);
  });

  it("draws a sample past the limit in one colour", () => {
    const big = "let a = 1;\n".repeat(Math.ceil(MAX_HIGHLIGHT / 10));
    const tokens = highlight(big, "javascript");
    expect(tokens.every((t) => t.kind === "plain")).toBe(true);
    expect(joined(tokens)).toBe(big);
  });

  it("never hands back a piece longer than one text node holds", () => {
    // Chromium splits a text node past 65,536 characters, and React then
    // fails to hydrate the page. The largest sample the block stores, in a
    // language that is coloured, one that is not, and all on one line.
    const samples: [string, string][] = [
      ["let a = 1;\n".repeat(Math.floor(MAX_CODE / 11)), "javascript"],
      ["x = 1\n".repeat(Math.floor(MAX_CODE / 6)), "php"],
      ["z".repeat(MAX_CODE), ""],
      ["// " + "c".repeat(MAX_HIGHLIGHT - 10), "javascript"],
    ];
    for (const [sample, language] of samples) {
      const tokens = highlight(sample, language);
      expect(joined(tokens)).toBe(sample);
      for (const t of tokens) expect(t.text.length).toBeLessThanOrEqual(MAX_TEXT_NODE);
      for (const line of splitTokenLines(tokens)) {
        for (const t of line) expect(t.text.length).toBeLessThanOrEqual(MAX_TEXT_NODE);
      }
    }
  });

  it("keeps <script> as text: pieces of the sample, never markup", () => {
    const sample = '<script>alert("hi")</script>';
    const tokens = highlight(sample, "html");
    expect(joined(tokens)).toBe(sample);
    // Neighbouring pieces of one kind are merged, so the tag is one piece.
    expect(tokens[0]).toEqual({ text: "<script>", kind: "tag" });
    // The inside is coloured as the script it is, still as text.
    expect(kindOf(tokens, "alert")).toBe("function");
    expect(kindOf(tokens, '"hi"')).toBe("string");
    expect(tokens[tokens.length - 1]).toEqual({ text: "</script>", kind: "tag" });
    for (const t of tokens) expect(Object.keys(t).sort()).toEqual(["kind", "text"]);
  });

  it("joins back into the input exactly, for every language and any input", () => {
    // A fixed-seed generator over the characters most likely to confuse a
    // scanner: quotes, slashes, brackets, escapes, newlines, a surrogate pair.
    const alphabet = [..."abcXYZ019 _$@#.-+*/\\\"'`<>=!&|;:,(){}[]\n\t%?~^"].concat(["😀", "é", "\r", "if", "</", "<!--", "*/", "${", "'''"]);
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const language of LANGUAGES) {
      for (let n = 0; n < 300; n++) {
        let sample = "";
        const length = Math.floor(rand() * 80);
        for (let i = 0; i < length; i++) sample += alphabet[Math.floor(rand() * alphabet.length)];
        const tokens = highlight(sample, language);
        expect(joined(tokens), `${language}: ${JSON.stringify(sample)}`).toBe(sample);
        expect(tokens.every((t) => t.text.length > 0)).toBe(true);
      }
    }
  });

  it("never splits a surrogate pair between two pieces", () => {
    for (const language of LANGUAGES) {
      for (const t of highlight("x😀y 😀 '😀' # 😀\n<😀>", language)) {
        expect(t.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      }
    }
  });

  it("takes time in step with the length of the input, even input built to defeat it", () => {
    // Each unit is repeated to MAX_HIGHLIGHT characters. `/[` is the one that
    // was quadratic: every `/` read to the end of its line looking for a
    // regular expression's closing slash — 450 ms for fifteen thousand.
    const units = [
      "/[", "(/[", "=/[", "{/[", "a = /\\", '"\\a', "'", "'''", "<a b=", "a { b:", "#", "1",
      "x<<EOF ", "<p>it's ", "<A {", "<style>a{b:/*", "<script>/[", "$'", "`",
    ];
    const build = (unit: string, length: number) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
    // The quickest of a few runs, so a busy machine measures this code and
    // not its neighbours.
    const time = (sample: string, language: string) => {
      let best = Infinity;
      for (let run = 0; run < 3; run++) {
        const started = performance.now();
        const tokens = highlight(sample, language);
        best = Math.min(best, performance.now() - started);
        expect(joined(tokens)).toBe(sample);
      }
      return best;
    };
    for (const language of LANGUAGES) {
      for (const unit of units) {
        const half = time(build(unit, MAX_HIGHLIGHT / 2), language);
        const full = time(build(unit, MAX_HIGHLIGHT), language);
        const label = `${language} ${JSON.stringify(unit)}: ${half.toFixed(1)} ms, then ${full.toFixed(1)} ms`;
        // Twice the input may take a little over twice the time; four times
        // is what quadratic looks like. The slack covers timer noise on runs
        // of a millisecond or two.
        expect(full, label).toBeLessThan(3 * half + 5);
        expect(full, label).toBeLessThan(50);
      }
    }
  });

  it("colours JavaScript", () => {
    const tokens = highlight('// note\nconst total = sum(1.5, 0x1f) + "a"; /* end */', "javascript");
    expect(kinds(tokens)).toEqual([
      ["// note", "comment"],
      ["const", "keyword"],
      ["sum", "function"],
      ["1.5", "number"],
      ["0x1f", "number"],
      ['"a"', "string"],
      ["/* end */", "comment"],
    ]);
  });

  it("tells a regular expression from a division by what comes before it", () => {
    expect(kindOf(highlight("const re = /a\\/b[/]+/gi;", "javascript"), "/a\\/b[/]+/gi")).toBe("string");
    const division = highlight("const half = total / 2 / 1;", "javascript");
    expect(kinds(division)).toEqual([["const", "keyword"], ["2", "number"], ["1", "number"]]);
  });

  it("does not take a property named like a keyword for the keyword", () => {
    const tokens = highlight("node.type = options.default; promise.catch(done)", "typescript");
    expect(kindOf(tokens, "type")).toBeUndefined();
    expect(kindOf(tokens, "default")).toBeUndefined();
    expect(kindOf(tokens, "catch")).toBe("function");
  });

  it("knows TypeScript's own words only in TypeScript", () => {
    expect(kindOf(highlight("interface Props { size: number }", "typescript"), "interface")).toBe("keyword");
    expect(kindOf(highlight("interface Props { size: number }", "typescript"), "number")).toBe("keyword");
    expect(kindOf(highlight("let interface = 1", "javascript"), "interface")).toBeUndefined();
  });

  it("colours JSX tags, and the end of one is not a regular expression", () => {
    const tokens = highlight("return <Button onClick={go} />;\n<p>a</p>", "jsx");
    expect(kindOf(tokens, "<Button")).toBe("tag");
    expect(kindOf(tokens, "onClick")).toBe("attr");
    expect(kindOf(tokens, "</p>")).toBe("tag");
    expect(tokens.some((t) => t.kind === "string")).toBe(false);
  });

  it("reads the text between JSX tags as prose, so an apostrophe opens no string", () => {
    const sample = "<p>Don't panic, you're {name}'s guest</p>\n<a href=\"/x\">Go</a>";
    const tokens = highlight(sample, "tsx");
    expect(tokens.some((t) => t.kind === "string" && t.text.includes("'"))).toBe(false);
    expect(kindOf(tokens, "</p>")).toBe("tag");
    expect(kindOf(tokens, '"/x"')).toBe("string");
    expect(kindOf(tokens, "href")).toBe("attr");
  });

  it("goes back to script inside braces, and back to prose after them", () => {
    const sample = "const list = (\n  <ul>\n    {items.map((i) => <li key={i}>{i}'s</li>)}\n  </ul>\n);\nconst after = 'x';";
    const tokens = highlight(sample, "jsx");
    expect(kindOf(tokens, "map")).toBe("function");
    expect(kindOf(tokens, "key")).toBe("attr");
    expect(kindOf(tokens, "</ul>")).toBe("tag");
    // Out of the element, the script is coloured as script again.
    expect(kindOf(tokens, "'x'")).toBe("string");
    expect(tokens.filter((t) => t.text === "const").every((t) => t.kind === "keyword")).toBe(true);
  });

  it("gives up on a tag that turns out not to be one", () => {
    // `<T,>` is a generic in a .tsx file. What follows is script, not prose.
    const tokens = highlight("const id = <T,>(value: T): T => value;\nconst n = 'x';", "tsx");
    expect(kindOf(tokens, "'x'")).toBe("string");
    expect(tokens.filter((t) => t.text === "const").every((t) => t.kind === "keyword")).toBe(true);
  });

  it("colours Python", () => {
    const tokens = highlight('@cache\ndef area(self, r=2):\n    """Doc."""\n    return None  # nothing\n', "python");
    expect(kinds(tokens)).toEqual([
      ["@cache", "function"],
      ["def", "keyword"],
      ["area", "function"],
      ["self", "variable"],
      ["2", "number"],
      ['"""Doc."""', "string"],
      ["return", "keyword"],
      ["None", "number"],
      ["# nothing", "comment"],
    ]);
    expect(kindOf(highlight("f'x' rb\"y\"", "python"), "f'x'")).toBe("string");
  });

  it("colours a shell command by the part a reader is looking for", () => {
    const tokens = highlight('$ NODE_ENV=production npm run build --prod # go\necho "$HOME" ${PATH} | grep -v x && sudo apt install git', "bash");
    expect(kinds(tokens)).toEqual([
      ["$", "comment"],
      ["NODE_ENV", "variable"],
      ["npm", "function"],
      ["--prod", "attr"],
      ["# go", "comment"],
      ["echo", "function"],
      ['"$HOME"', "string"],
      ["${PATH}", "variable"],
      ["grep", "function"],
      ["-v", "attr"],
      ["sudo", "function"],
      ["apt", "function"],
    ]);
  });

  it("reads a here-document as text handed to the command", () => {
    const tokens = highlight("cat <<'EOF' > notes.txt\nif this; then that # not code\nEOF\necho done", "bash");
    expect(kindOf(tokens, "<<'EOF'")).toBe("keyword");
    expect(kindOf(tokens, "if this; then that # not code\n")).toBe("string");
    expect(kindOf(tokens, "EOF")).toBe("keyword");
    expect(kindOf(tokens, "echo")).toBe("function");
    // `<<-` lets the closing word be indented with tabs.
    const dashed = highlight("cat <<-END\n\tbody\n\tEND\nls", "bash");
    expect(kindOf(dashed, "\tEND")).toBe("keyword");
    expect(kindOf(dashed, "ls")).toBe("function");
  });

  it("only takes # for a comment at the start of a word", () => {
    expect(highlight("echo a#b", "bash").some((t) => t.kind === "comment")).toBe(false);
    expect(kindOf(highlight("if true; then\n  ls\nfi", "bash"), "if")).toBe("keyword");
  });

  it("colours JSON keys apart from JSON strings", () => {
    const tokens = highlight('{ "name": "Neuravex", "port": 3000, "ok": true, "none": null }', "json");
    expect(kinds(tokens)).toEqual([
      ['"name"', "property"],
      ['"Neuravex"', "string"],
      ['"port"', "property"],
      ["3000", "number"],
      ['"ok"', "property"],
      ["true", "number"],
      ['"none"', "property"],
      ["null", "number"],
    ]);
  });

  it("colours CSS, telling a selector's colon from a declaration's", () => {
    const tokens = highlight("/* c */\n@media (min-width: 600px) {\n  a:hover, .card > #main { color: #fff; margin: calc(1rem - 2px) !important; }\n}", "css");
    expect(kinds(tokens)).toEqual([
      ["/* c */", "comment"],
      ["@media", "keyword"],
      ["600px", "number"],
      ["a", "tag"],
      [":hover", "keyword"],
      [".card", "tag"],
      ["#main", "tag"],
      ["color", "property"],
      ["#fff", "number"],
      ["margin", "property"],
      ["calc", "function"],
      ["1rem", "number"],
      ["2px", "number"],
      ["!important", "keyword"],
    ]);
  });

  it("colours HTML, and a comparison inside a script is not a tag", () => {
    const tokens = highlight('<!doctype html>\n<!-- c -->\n<a href="/x" hidden>Tom &amp; Jerry</a>\n<script>if (a < b) go()</script>', "html");
    expect(kinds(tokens)).toEqual([
      ["<!doctype html>", "keyword"],
      ["<!-- c -->", "comment"],
      ["<a", "tag"],
      ["href", "attr"],
      ['"/x"', "string"],
      ["hidden", "attr"],
      [">", "tag"],
      ["&amp;", "number"],
      ["</a>", "tag"],
      ["<script>", "tag"],
      ["if", "keyword"],
      ["go", "function"],
      ["</script>", "tag"],
    ]);
  });
});

describe("language labels", () => {
  it("names the languages the panel offers, and nothing for plain text", () => {
    expect(languageLabel("javascript")).toBe("JavaScript");
    expect(languageLabel(" TypeScript ")).toBe("TypeScript");
    expect(languageLabel("csharp")).toBe("C#");
    for (const plain of ["", "text", "plaintext", "none", undefined, null]) expect(languageLabel(plain)).toBe("");
  });

  it("knows the ways of saying no language in particular", () => {
    for (const plain of ["", "text", " Plaintext ", "none", "txt"]) expect(isPlainLanguage(plain)).toBe(true);
    for (const other of ["bash", "Elixir"]) expect(isPlainLanguage(other)).toBe(false);
  });

  it("shows a language it does not know as it was written", () => {
    expect(languageLabel("Elixir")).toBe("Elixir");
  });

  it("offers each language once", () => {
    const values = CODE_LANGUAGES.map((l) => l.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("the download", () => {
  // What the published page contains for samples that mention this site's
  // own files. The export rewrites and bundles paths only inside tags and
  // `<style>` bodies, so the text between tags — which is where a sample
  // always is — goes out exactly as the page showed it, and names no file
  // as missing that only a sample mentioned.
  const html =
    '<code class="nvx-code__code">src=<span class="nvx-tok-string">&quot;/uploads/a.png&quot;</span> ' +
    "or &#x27;/stock/b.jpg&#x27;\n" +
    '<span class="nvx-tok-function">url</span>(/uploads/y.png) and ![](/stock/c.jpg)</code>';

  it("leaves paths in a sample alone, quoted or not", () => {
    expect(rewriteAssetPaths(html)).toBe(html);
  });

  it("does not go looking for a file a sample only mentions", () => {
    expect(collectLocalAssets(html)).toEqual([]);
  });
});
