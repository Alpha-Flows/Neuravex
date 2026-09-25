import { describe, it, expect } from "vitest";
import {
  normalizeBlockTree,
  normalizeBlockTreeJson,
  clampSortOrder,
  safeProps,
  MAX_DEPTH,
  MAX_NODES,
  MAX_SORT_ORDER,
  allowedValues,
  BLOCK_TYPES,
  SOCIAL_NETWORKS,
} from "@/lib/block-tree";

const block = (type: string, props: unknown = {}, extra: Record<string, unknown> = {}) => ({
  id: "x",
  type,
  props,
  ...extra,
});

describe("what a block tree has to be", () => {
  it("refuses anything that is not a list of blocks", () => {
    for (const input of [null, 42, "hello", { blocks: [] }]) {
      expect(normalizeBlockTree(input).ok).toBe(false);
    }
  });

  it("reads a tree that arrived as JSON, and refuses one that is not JSON", () => {
    expect(normalizeBlockTree('[{"id":"a","type":"text","props":{"text":"hi"}}]').ok).toBe(true);
    expect(normalizeBlockTree("{not json").ok).toBe(false);
  });

  it("drops a null node instead of dying on it", () => {
    // Creating a page reads its siblings to pick a starting look, and a null
    // node threw there — so no new page could be made on that site at all.
    const result = normalizeBlockTree([null, block("text", { text: "kept" }), undefined]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tree).toHaveLength(1);
  });

  it("drops a node whose type is not one we render", () => {
    const result = normalizeBlockTree([block("nonsense"), block("text")]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tree.map((b) => b.type)).toEqual(["text"]);
  });
});

describe("props that used to throw inside the renderer", () => {
  it("makes a list's items an array", () => {
    // `List` maps over props.items. A string here was a 500 on the editor and
    // the published page, with no error boundary to click past.
    const result = normalizeBlockTree([block("list", { items: "not an array" })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tree[0].props.items).toEqual([]);
  });

  it("makes a form's fields an array", () => {
    const result = normalizeBlockTree([block("form", { fields: 7 })]);
    if (result.ok) expect(result.tree[0].props.fields).toEqual([]);
  });

  it("puts a heading level back in range", () => {
    const result = normalizeBlockTree([block("heading", { text: "Hi", level: 99 })]);
    if (result.ok) expect(result.tree[0].props.level).toBe(2);
  });

  it("hands the sanitiser a string, never something else", () => {
    const result = normalizeBlockTree([block("html", { html: { nope: true } })]);
    if (result.ok) expect(result.tree[0].props.html).toBe("");
  });
});

describe("the href nobody checked", () => {
  it("refuses javascript: on a button", () => {
    // On the builder the CSP refuses the navigation; the exported site has no
    // CSP, so on the customer's domain the call-to-action ran the script.
    const result = normalizeBlockTree([block("button", { label: "Go", href: "javascript:alert(1)" })]);
    if (result.ok) expect(result.tree[0].props.href).toBe("#");
  });

  it("refuses it written with control characters inside the scheme", () => {
    const result = normalizeBlockTree([block("button", { href: "java\u0000script:alert(1)" })]);
    if (result.ok) expect(result.tree[0].props.href).toBe("#");
  });

  it("refuses data: and vbscript: too", () => {
    for (const href of ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
      const result = normalizeBlockTree([block("button", { href })]);
      if (result.ok) expect(result.tree[0].props.href).toBe("#");
    }
  });

  it("keeps the links people actually write", () => {
    for (const href of ["/about", "https://example.com", "mailto:a@b.co", "tel:+49301234", "#top", "about.html"]) {
      const result = normalizeBlockTree([block("button", { href })]);
      if (result.ok) expect(result.tree[0].props.href).toBe(href);
    }
  });

  it("refuses javascript: on an image and a video too", () => {
    const image = normalizeBlockTree([block("image", { src: "javascript:alert(1)" })]);
    if (image.ok) expect(image.tree[0].props.src).toBe("");
    const video = normalizeBlockTree([block("video", { src: "javascript:alert(1)", poster: "javascript:x" })]);
    if (video.ok) {
      expect(video.tree[0].props.src).toBe("");
      expect(video.tree[0].props.poster).toBe("");
    }
  });

  it("keeps an ordinary video file address — it renders in a <video>, not a frame", () => {
    const result = normalizeBlockTree([block("video", { src: "https://cdn.example/clip.mp4" })]);
    if (result.ok) expect(result.tree[0].props.src).toBe("https://cdn.example/clip.mp4");
  });
});

describe("colours that carried a second declaration", () => {
  it("drops one from a heading", () => {
    const result = normalizeBlockTree([
      block("heading", { text: "Hi", color: "red;background:url(https://attacker.example/x)" }),
    ]);
    if (result.ok) expect(result.tree[0].props.color).toBe("");
  });

  it("drops one from a section background and its overlay", () => {
    const result = normalizeBlockTree([
      block("section", {
        background: "#fff);background-image:url(https://attacker.example/p",
        backgroundOverlay: "rgba(0,0,0,.5);behavior:url(x)",
      }),
    ]);
    if (result.ok) {
      expect(JSON.stringify(result.tree)).not.toContain("attacker.example");
      expect(JSON.stringify(result.tree)).not.toContain("behavior");
    }
  });

  it("keeps a colour that is one", () => {
    const result = normalizeBlockTree([block("heading", { text: "Hi", color: "#3b82f6" })]);
    if (result.ok) expect(result.tree[0].props.color).toBe("#3b82f6");
  });
});

describe("rich text is sanitised on the way in", () => {
  it("drops a <style> element from a text block", () => {
    const result = normalizeBlockTree([
      block("text", { text: "<style>body{outline:solid 5px red}</style>hello" }),
    ]);
    if (result.ok) expect(result.tree[0].props.text).toBe("hello");
  });

  it("drops a beacon image and a meta refresh", () => {
    const result = normalizeBlockTree([
      block("text", { text: '<img src="https://attacker.example/b.gif"><meta http-equiv="refresh" content="0;url=x">hi' }),
    ]);
    if (result.ok) expect(result.tree[0].props.text).toBe("hi");
  });

  it("keeps the formatting the toolbar produces", () => {
    const result = normalizeBlockTree([block("text", { text: "a <strong>b</strong> c" })]);
    if (result.ok) expect(result.tree[0].props.text).toBe("a <strong>b</strong> c");
  });
});

describe("limits", () => {
  it("refuses a tree deeper than it will walk", () => {
    // About 200 levels broke the editor, 400 the public page, 8000 the legal
    // audit and the download — a stack overflow with nothing to click past.
    let node: Record<string, unknown> = block("text", { text: "deep" });
    for (let i = 0; i < MAX_DEPTH + 20; i++) node = block("section", {}, { children: [node] });

    const result = normalizeBlockTree([node]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      let depth = 0;
      let cursor: { children?: unknown[] } | undefined = result.tree[0];
      while (cursor) {
        depth++;
        cursor = (cursor.children as { children?: unknown[] }[] | undefined)?.[0];
      }
      expect(depth).toBeLessThanOrEqual(MAX_DEPTH);
    }
  });

  it("refuses a tree with more nodes than it will store", () => {
    const many = Array.from({ length: MAX_NODES + 10 }, () => block("spacer"));
    expect(normalizeBlockTree(many).ok).toBe(false);
  });

  it("refuses a tree larger than it will store, without building it first", () => {
    // 5000 nodes each holding the maximum text is half a gigabyte, so the
    // budget is counted as the walk goes rather than measured at the end.
    const huge = Array.from({ length: 200 }, () => block("text", { text: "x".repeat(90_000) }));
    expect(normalizeBlockTree(huge).ok).toBe(false);
  });

  it("truncates one over-long text prop rather than refusing the page", () => {
    const result = normalizeBlockTree([block("text", { text: "x".repeat(5 * 1024 * 1024) })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tree[0].props.text.length).toBeLessThanOrEqual(100_000);
  });
});

describe("clampSortOrder", () => {
  it("keeps an out-of-range value inside the 32-bit column", () => {
    expect(clampSortOrder(1e12)).toBe(MAX_SORT_ORDER);
    expect(clampSortOrder(-1)).toBe(0);
    expect(clampSortOrder(3.7)).toBe(3);
  });

  it("answers undefined for anything that is not a number", () => {
    expect(clampSortOrder("5")).toBeUndefined();
    expect(clampSortOrder(NaN)).toBeUndefined();
    expect(clampSortOrder(Infinity)).toBeUndefined();
  });
});

describe("safeProps — the last line of defence at render", () => {
  it("repairs a row written before any of this existed", () => {
    const props = safeProps("list", { items: "broken" }, { items: [] as string[] });
    expect(props.items).toEqual([]);
  });

  it("hands back the fallback for a type it does not know", () => {
    expect(safeProps("nonsense", { a: 1 }, "fallback")).toBe("fallback");
  });
});

describe("normalizeBlockTreeJson", () => {
  it("answers the string the content column holds", () => {
    const result = normalizeBlockTreeJson([block("text", { text: "hi" })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.json)[0].props.text).toBe("hi");
  });
});

describe("a block's id", () => {
  it("is made for a block whose id is empty, as for one with none", () => {
    // An empty id drew the same anchors as a block called `block`.
    const result = normalizeBlockTree([
      { id: "", type: "text", props: { text: "a" } },
      { id: "block", type: "text", props: { text: "b" } },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].id).not.toBe("");
    expect(result.tree[1].id).toBe("block");
  });

  it("is made afresh for a second block that repeats one", () => {
    const result = normalizeBlockTree([
      { id: "pricing", type: "text", props: { text: "a" } },
      { id: "pricing", type: "text", props: { text: "b" } },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.tree[0].id).toBe("pricing");
    expect(result.tree[1].id).not.toBe("pricing");
  });
});

describe("the values a prop must come from", () => {
  it("are read from the schemas, nested lists included", () => {
    expect(allowedValues("social")["links[].network"]).toEqual([...SOCIAL_NETWORKS]);
    expect(allowedValues("social").size).toContain("md");
    expect(allowedValues("code").theme).toEqual(["dark", "light"]);
    expect(allowedValues("list").style).toEqual(["bullet", "number", "check"]);
  });

  it("are each one the validator keeps as written", () => {
    // Every listed value, stored, comes back as itself: a list that named a
    // value the validator then repaired would teach an agent the wrong one.
    for (const type of BLOCK_TYPES) {
      for (const [path, values] of Object.entries(allowedValues(type))) {
        if (path.includes("[]")) continue;
        for (const value of values) {
          const result = normalizeBlockTree([{ id: "b", type, props: { [path]: value } }]);
          if (!result.ok) throw new Error(result.error);
          expect(result.tree[0]?.props[path], `${type}.${path} = ${value}`).toBe(value);
        }
      }
    }
  });

  it("are not listed for a prop that takes anything", () => {
    expect(allowedValues("text")).not.toHaveProperty("text");
    expect(allowedValues("nothing-of-the-sort")).toEqual({});
  });
});

