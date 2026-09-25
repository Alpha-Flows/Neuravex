/**
 * An `id` for something a block draws, made from the block's own id.
 *
 * The blocks that work without a script — a lightbox opened by `:target`, a
 * slider moved by anchor links, an accordion whose items close each other by
 * sharing a `name` — all need a name that is unique on the page and safe in a
 * URL fragment. A block's id is unique, but it is only guaranteed to be a
 * string of at most 128 characters: one imported from elsewhere can hold a
 * space, a quote or a `#`, and any of those breaks `href="#…"` in a way
 * React's attribute escaping does not cover. So letters, digits and `-` are
 * kept, and everything else — `_` included — is written as `_<hex>_`, which
 * is safe in a fragment and cannot be mistaken for anything kept as it was.
 * That matters: these characters used to be dropped, so `q"><x` and `q<x`
 * both became `qx`, two pricing blocks drew the same ids, and one plan's
 * button was read out with the other block's plan name. What is left is
 * prefixed so it cannot start with a digit or collide with the ids the
 * sanitiser gives authored HTML.
 */
export function domId(blockId: string | undefined, ...parts: (string | number)[]): string {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`);
  // In the block's own id a `-` is written out too, because it is the
  // separator: kept as it was, a gallery called `a` drew `nvx-a-photo-1` for
  // its first picture, and so did the wrapper of a gallery called
  // `a-photo-1`. The parts after it are this code's own words.
  //
  // A block with no id at all is `_`, which no id can be written as, since a
  // real `_` always comes out `_5f_`. It used to be `block`, which is also
  // what a block called `block` comes out as, so two galleries with those
  // two ids opened each other's pictures.
  const base = (blockId ?? "").replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`) || "_";
  return ["nvx", base, ...parts.map((p) => clean(String(p)))].filter(Boolean).join("-");
}
