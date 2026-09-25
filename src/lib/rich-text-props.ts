import type { BaseBlock } from "@/types";

/**
 * Where a block keeps text that is drawn as markup.
 *
 * Text, heading, list, quote, button and form-label props all render through
 * the inline sanitiser, and so do an accordion's answers, a table's cells, a
 * plan's features and a slide's caption — and any of them can hold a link or
 * a picture that the formatting toolbar or a paste put there. Two things need
 * to find every one: the privacy audit, which was blind to a tracker `<img>`
 * inside a Text block, and the page-rename sweep, which moved the pricing
 * button beside an FAQ answer and left the link inside the answer pointing at
 * the page's old address, a 404. They kept separate lists, and the second one
 * had only the Custom HTML block on it. This is the one list, and it can
 * rewrite as well as read, so the two cannot drift.
 */
const TEXT_PROPS = ["text", "label", "caption", "author", "role", "submitLabel", "successMessage", "title", "description", "address"];

/** Rich text a block keeps in a list of records, as `[list prop, fields]`. */
const NESTED_TEXT: Partial<Record<BaseBlock["type"], [string, string[]][]>> = {
  accordion: [["items", ["title", "body"]]],
  pricing: [["plans", ["name", "price", "period", "description", "badge", "buttonLabel"]]],
  gallery: [["images", ["caption"]]],
  slider: [["slides", ["caption"]]],
  form: [["fields", ["label"]]],
};

type Edit = (html: string) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A list with `edit` applied to each string in it, or the same list when none changed. */
function editStrings(list: unknown[], edit: Edit): unknown[] {
  let changed = false;
  const next = list.map((value) => {
    if (typeof value !== "string") return value;
    const out = edit(value);
    if (out !== value) changed = true;
    return out;
  });
  return changed ? next : list;
}

/** A record with `edit` applied to the named string fields, or the same record. */
function editFields(record: Record<string, unknown>, fields: string[], edit: Edit): Record<string, unknown> {
  let next = record;
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== "string") continue;
    const out = edit(value);
    if (out !== value) next = { ...next, [field]: out };
  }
  return next;
}

/**
 * A block's props with `edit` applied to every piece of rich text in them.
 *
 * The same object comes back when nothing changed, so a caller can tell a
 * block it rewrote from one it only read. A code sample is left out: it is
 * shown as text, escaped, and `<a href=…>` written in one is a line of code
 * on the page, not a link.
 */
export function mapRichText(type: string, props: Record<string, unknown>, edit: Edit): Record<string, unknown> {
  if (type === "code" || !isRecord(props)) return props;
  let next = editFields(props, TEXT_PROPS, edit);

  // A List block's items, which are strings. An accordion's are records and
  // are reached below.
  if (Array.isArray(next.items)) {
    const items = editStrings(next.items, edit);
    if (items !== next.items) next = { ...next, items };
  }

  for (const [listKey, fields] of NESTED_TEXT[type as BaseBlock["type"]] ?? []) {
    const list = next[listKey];
    if (!Array.isArray(list)) continue;
    let moved = false;
    const edited = list.map((entry) => {
      if (!isRecord(entry)) return entry;
      let out = editFields(entry, fields, edit);
      // A plan's features are a list of their own.
      if (type === "pricing" && Array.isArray(out.features)) {
        const features = editStrings(out.features, edit);
        if (features !== out.features) out = { ...out, features };
      }
      if (out !== entry) moved = true;
      return out;
    });
    if (moved) next = { ...next, [listKey]: edited };
  }

  if (type === "table" && Array.isArray(next.rows)) {
    let moved = false;
    const rows = next.rows.map((row) => {
      if (!Array.isArray(row)) return row;
      const out = editStrings(row, edit);
      if (out !== row) moved = true;
      return out;
    });
    if (moved) next = { ...next, rows };
  }

  return next;
}

/** Every piece of rich text in a block's props, in the order `mapRichText` visits them. */
export function richTextValues(type: string, props: Record<string, unknown>): string[] {
  const out: string[] = [];
  mapRichText(type, props, (html) => {
    out.push(html);
    return html;
  });
  return out;
}
