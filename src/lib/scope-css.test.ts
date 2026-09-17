import { describe, it, expect } from "vitest";
import { scopeCss } from "@/lib/scope-css";

const scope = ".public-canvas";
const css = (s: string) => scopeCss(s, scope).replace(/\s+/g, " ").trim();

describe("scopeCss", () => {
  it("confines an ordinary rule to the scope", () => {
    expect(css("p { color: red }")).toBe(".public-canvas p { color: red }");
  });

  it("scopes every selector in a list", () => {
    expect(css("h1, h2 { margin: 0 }")).toBe(".public-canvas h1, .public-canvas h2 { margin: 0 }");
  });

  it("turns the document roots into the scope itself", () => {
    // Inside the canvas, "the page" is the canvas.
    expect(css("body { background: black }")).toBe(".public-canvas { background: black }");
    expect(css(":root { --x: 1px }")).toBe(".public-canvas { --x: 1px }");
    expect(css("html { font-size: 20px }")).toBe(".public-canvas { font-size: 20px }");
  });

  it("keeps what follows a root selector", () => {
    expect(css("body p { color: red }")).toBe(".public-canvas p { color: red }");
  });

  it("scopes the rules inside a media query, not the query", () => {
    expect(css("@media (max-width: 600px) { p { color: red } }")).toBe(
      "@media (max-width: 600px) { .public-canvas p { color: red } }",
    );
  });

  it("leaves at-rules that hold no selectors alone", () => {
    expect(css("@keyframes spin { from { opacity: 0 } to { opacity: 1 } }")).toBe(
      "@keyframes spin { from { opacity: 0 } to { opacity: 1 } }",
    );
    expect(css('@font-face { font-family: "X"; src: local("X") }')).toContain("@font-face {");
  });

  it("handles nested blocks without losing the outer rule", () => {
    const out = css("@supports (display: grid) { @media screen { a { color: blue } } }");
    expect(out).toBe("@supports (display: grid) { @media screen { .public-canvas a { color: blue } } }");
  });

  it("carries a statement at-rule through untouched", () => {
    expect(css('@charset "utf-8"; p { color: red }')).toBe('@charset "utf-8"; .public-canvas p { color: red }');
  });

  it("does not choke on an unclosed rule", () => {
    expect(() => scopeCss("p { color: red", scope)).not.toThrow();
    expect(css("p { color: red")).toContain(".public-canvas p");
  });

  it("returns nothing for nothing", () => {
    expect(scopeCss("", scope)).toBe("");
    expect(scopeCss("   ", scope)).toBe("");
  });

  it("cannot be escaped by a rule aimed at the builder's own chrome", () => {
    // The point of the exercise: a site's CSS must not repaint the editor.
    const out = css(".editor-toolbar { display: none } body, html { color: red }");
    expect(out).toContain(".public-canvas .editor-toolbar");
    // Every rule in the result begins inside the canvas.
    for (const rule of scopeCss(".editor-toolbar { display: none } body, html { color: red }", scope).split("}")) {
      const prelude = rule.split("{")[0].trim();
      if (prelude) expect(prelude.startsWith(".public-canvas"), prelude).toBe(true);
    }
  });
});
