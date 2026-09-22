import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The pages that exist because something else failed.
 *
 * Two things matter enough to pin. The first is placement: both root layouts
 * in this app live inside route groups and each emits its own `<html>`, so a
 * single `not-found.tsx` at `src/app/` would render *above* both of them,
 * outside the document — the boundaries have to sit beside each layout. The
 * second is that none of them prints the error's message, which on a
 * client-side throw arrives intact and can carry a filesystem path or a
 * fragment of SQL.
 *
 * What these cannot check is that Next wires them up; only a browser can say
 * that, and `e2e/error-pages.spec.ts` does.
 */

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const builderError = read("src", "app", "(builder)", "error.tsx");
const builderNotFound = read("src", "app", "(builder)", "not-found.tsx");
const publishedError = read("src", "app", "(published)", "sites", "[siteSlug]", "error.tsx");
const publishedNotFound = read("src", "app", "(published)", "sites", "[siteSlug]", "not-found.tsx");
const globalError = read("src", "app", "global-error.tsx");
const editor = read("src", "app", "(builder)", "admin", "sites", "[id]", "pages", "[pageId]", "page.tsx");

const boundaries = {
  "(builder)/error.tsx": builderError,
  "(builder)/not-found.tsx": builderNotFound,
  "(published)/…/error.tsx": publishedError,
  "(published)/…/not-found.tsx": publishedNotFound,
  "global-error.tsx": globalError,
};

describe("where the boundaries live", () => {
  it("puts one beside each root layout, not one at the root", () => {
    // A file at `src/app/not-found.tsx` would sit above both `<html>`
    // elements, and Next also stops inserting its own boundary at the group
    // roots once a root-level fallback exists.
    expect(() => read("src", "app", "(builder)", "layout.tsx")).not.toThrow();
    expect(() => read("src", "app", "(published)", "sites", "[siteSlug]", "layout.tsx")).not.toThrow();
    expect(() => read("src", "app", "layout.tsx")).toThrow();
  });

  it("makes every error boundary a client component", () => {
    // `error.tsx` takes `reset`, so Next requires it.
    for (const [name, source] of Object.entries(boundaries)) {
      if (!name.includes("error")) continue;
      expect(source.trimStart().startsWith('"use client"'), `${name} must be a client component`).toBe(true);
    }
  });

  it("gives global-error its own document, because it replaces the layout", () => {
    expect(globalError).toContain("<html");
    expect(globalError).toContain("<body");
  });

  it("styles global-error inline, because the stylesheet arrives through a layout", () => {
    // The one page guaranteed to run when a layout has failed cannot depend
    // on what that layout would have loaded.
    expect(globalError).not.toMatch(/^import .*globals\.css/m);
    expect(globalError).not.toContain("className=");
    expect(globalError).toContain("background: \"#0b0d12\"");
  });
});

describe("what the boundaries say", () => {
  it("never prints the error's own message", () => {
    for (const [name, source] of Object.entries(boundaries)) {
      expect(source, `${name} must not render error.message`).not.toContain("error.message");
    }
  });

  it("offers the digest instead, which is what matches a terminal line", () => {
    expect(builderError).toContain("error.digest");
    expect(globalError).toContain("error.digest");
  });

  it("gives every failure page a way out", () => {
    expect(builderError).toContain("reset");
    expect(publishedError).toContain("reset");
    expect(globalError).toContain("reset");
    expect(builderNotFound).toContain('href="/"');
  });

  it("keeps the builder out of a visitor's 404", () => {
    // This is a page on somebody's public website. What went wrong behind it
    // is not the visitor's business, and the product's name is not either.
    expect(publishedNotFound).not.toMatch(/Neuravex/);
    expect(publishedError).not.toMatch(/>\s*Neuravex/);
  });

  it("puts the published pages on the site's own white surface", () => {
    // `globals.css` sets `html, body` to the builder's black for every
    // document in the app, so a published page that does not opt into
    // `.public-canvas` renders on it.
    expect(publishedNotFound).toContain('tone="light"');
    expect(publishedError).toContain('tone="light"');
    expect(read("src", "components", "ui", "Fallback.tsx")).toContain("public-canvas");
  });

  it("does not read the database to draw a visitor's 404", () => {
    // `not-found.tsx` gets no route params, and the read may be the very
    // thing that failed.
    expect(publishedNotFound).not.toContain("prisma");
  });
});

describe("the editor's own read of a page", () => {
  it("goes through the shared validator like every other path", () => {
    // It was the one read that trusted the database: a bare JSON.parse in a
    // try/catch, which survived malformed JSON but handed the editor whatever
    // the array happened to contain.
    expect(editor).not.toContain("JSON.parse(page.content");
    expect(editor).toContain("normalizeBlockTree(page.content");
  });
});
