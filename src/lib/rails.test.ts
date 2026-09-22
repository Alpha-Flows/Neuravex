import { describe, it, expect, beforeEach } from "vitest";
import { readRails, writeRails, RAILS_OPEN, railsSnapshot, railsServerSnapshot, subscribeRails, setRails } from "@/lib/rails";

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

/** One that throws on every call, as a private window can. */
function hostileStorage(): Storage {
  const bang = () => { throw new Error("nope"); };
  return { getItem: bang, setItem: bang, removeItem: bang, clear: bang, key: bang, length: 0 } as unknown as Storage;
}

let store: Storage;
beforeEach(() => { store = memoryStorage(); });

describe("remembering which rails are folded", () => {
  it("shows both rails until someone folds one", () => {
    expect(readRails(store)).toEqual(RAILS_OPEN);
  });

  it("keeps each rail's state on its own", () => {
    writeRails({ left: true, right: false }, store);
    expect(readRails(store)).toEqual({ left: true, right: false });

    writeRails({ left: false, right: true }, store);
    expect(readRails(store)).toEqual({ left: false, right: true });
  });

  it("reads a half-written or hand-edited value as open", () => {
    store.setItem("neuravex:rails", "{not json");
    expect(readRails(store)).toEqual(RAILS_OPEN);

    // Anything that is not exactly `true` means the rail is showing, so a
    // stray string cannot hide the palette with no way to get it back.
    store.setItem("neuravex:rails", JSON.stringify({ left: "yes", right: 1 }));
    expect(readRails(store)).toEqual(RAILS_OPEN);
  });

  it("carries on when storage refuses", () => {
    const hostile = hostileStorage();
    expect(readRails(hostile)).toEqual(RAILS_OPEN);
    expect(writeRails({ left: true, right: true }, hostile)).toBe(false);
  });
});

describe("the preference as something to subscribe to", () => {
  it("hands back the same object until something writes", () => {
    // `useSyncExternalStore` compares snapshots by identity. A fresh object
    // from every read would be a render that never settles.
    expect(railsSnapshot()).toBe(railsSnapshot());
  });

  it("shows both rails to the server, which cannot know the preference", () => {
    expect(railsServerSnapshot()).toEqual(RAILS_OPEN);
  });

  it("tells subscribers when the preference changes, and stops when they leave", () => {
    let calls = 0;
    const stop = subscribeRails(() => calls++);
    setRails({ left: true, right: false });
    expect(calls).toBe(1);
    expect(railsSnapshot()).toEqual({ left: true, right: false });

    stop();
    setRails({ left: false, right: true });
    expect(calls).toBe(1);
    expect(railsSnapshot()).toEqual({ left: false, right: true });
  });
});
