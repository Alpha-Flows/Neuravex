import { describe, it, expect, beforeEach } from "vitest";
import { readClipboard, writeClipboard, clearClipboard, pasteable, isBlock, clipboardLabel, clipboardServerLabel, subscribeClipboard } from "@/lib/clipboard";
import { BaseBlock } from "@/types";

/** A stand-in for localStorage, including one that refuses to co-operate. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

const section: BaseBlock = {
  id: "s1",
  type: "section",
  props: { background: "#fff" },
  children: [
    { id: "h1", type: "heading", props: { text: "Hello" } },
    { id: "c1", type: "columns", props: { count: 2 }, children: [{ id: "t1", type: "text", props: { text: "Inside" } }] },
  ],
};

let store: Storage;
beforeEach(() => { store = memoryStorage(); });

describe("the clipboard", () => {
  it("holds a block and gives it back", () => {
    expect(writeClipboard(section, "Section", store)).toBe(true);
    const entry = readClipboard(store)!;
    expect(entry.label).toBe("Section");
    expect(entry.block.children).toHaveLength(2);
    expect(entry.copiedAt).toBeGreaterThan(0);
  });

  it("is empty when nothing was copied", () => {
    expect(readClipboard(store)).toBeNull();
  });

  it("survives a copy taken on another page", () => {
    // The point of using storage rather than React state: the editor is
    // remounted on every page, and a copy has to outlive that.
    writeClipboard(section, "Section", store);
    const onAnotherPage = readClipboard(store);
    expect(onAnotherPage?.block.id).toBe("s1");
  });

  it("ignores a value that is not a block", () => {
    store.setItem("neuravex:clipboard", JSON.stringify({ block: { nope: true } }));
    expect(readClipboard(store)).toBeNull();
    store.setItem("neuravex:clipboard", "not json at all");
    expect(readClipboard(store)).toBeNull();
  });

  it("says so when it cannot store anything", () => {
    // A private window, or storage that is full.
    const refusing = { ...memoryStorage(), setItem: () => { throw new Error("nope"); } } as Storage;
    expect(writeClipboard(section, "Section", refusing)).toBe(false);
  });

  it("empties on request", () => {
    writeClipboard(section, "Section", store);
    clearClipboard(store);
    expect(readClipboard(store)).toBeNull();
  });
});

describe("pasteable", () => {
  it("gives every block in the copy an id of its own", () => {
    writeClipboard(section, "Section", store);
    const entry = readClipboard(store)!;
    const first = pasteable(entry)!;
    const second = pasteable(entry)!;

    const ids = (b: BaseBlock, out: string[] = []): string[] => {
      out.push(b.id);
      b.children?.forEach((c) => ids(c, out));
      return out;
    };
    const a = ids(first);
    const b = ids(second);

    // Two pastes of one copy must not share an id, or selecting and dragging
    // break for both of them.
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
    expect(a).not.toContain("s1");
    expect(a).not.toContain("t1");
  });

  it("keeps the content it is copying", () => {
    writeClipboard(section, "Section", store);
    const copy = pasteable(readClipboard(store)!)!;
    expect(copy.type).toBe("section");
    // The tree is validated on the way out of storage, so the props come back
    // filled out to the type's shape rather than as whatever was stored.
    expect(copy.children?.[0].props).toMatchObject({ text: "Hello" });
    expect(copy.children?.[1].children?.[0].props).toMatchObject({ text: "Inside" });
  });

  it("does not disturb what was copied", () => {
    writeClipboard(section, "Section", store);
    pasteable(readClipboard(store)!);
    expect(readClipboard(store)!.block.id).toBe("s1");
  });
});

describe("isBlock", () => {
  it("knows a block from anything else", () => {
    expect(isBlock({ id: "a", type: "text" })).toBe(true);
    for (const bad of [null, undefined, {}, { id: "a" }, { type: "text" }, "text", 42]) {
      expect(isBlock(bad)).toBe(false);
    }
  });
});

describe("the clipboard label, as something to subscribe to", () => {
  it("is nothing as far as the server is concerned", () => {
    expect(clipboardServerLabel()).toBeNull();
  });

  it("follows a copy without anyone being told to update it", () => {
    // The editor used to keep its own copy of this and set it by hand at the
    // one place that copies, which is two places to forget.
    let calls = 0;
    const stop = subscribeClipboard(() => calls++);
    const store = memoryStorage();
    writeClipboard({ id: "b1", type: "heading", props: {} } as never, "Heading", store);
    expect(calls).toBe(1);
    expect(clipboardLabel()).toBe("Heading");
    stop();
  });
});
