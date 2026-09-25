/**
 * An `id` for something a block draws, made from the block's own id.
 *
 * The blocks that work without a script — a lightbox opened by `:target`, a
 * slider moved by anchor links, an accordion whose items close each other by
 * sharing a `name` — all need a name that is unique on the page and safe in a
 * URL fragment. A block's id is unique, but it is only guaranteed to be a
 * string of at most 128 characters: one imported from elsewhere can hold a
 * space, a quote or a `#`, and any of those breaks `href="#…"` in a way
 * React's attribute escaping does not cover. So only letters, digits, `-`
 * and `_` survive, and what is left is prefixed so it cannot start with a
 * digit or collide with the ids the sanitiser gives authored HTML.
 */
export function domId(blockId: string | undefined, ...parts: (string | number)[]): string {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "");
  const base = clean(blockId ?? "") || "block";
  return ["nvx", base, ...parts.map((p) => clean(String(p)))].filter(Boolean).join("-");
}
