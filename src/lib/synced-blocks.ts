/**
 * Synced blocks: one saved block, on many pages, kept the same everywhere.
 *
 * A saved block was a copy. A banner used on twelve pages was twelve banners,
 * and changing its wording meant opening all twelve pages; a copy missed kept
 * the old wording, which is how a site ends up advertising last season's
 * opening hours on the pages nobody remembered. A saved block can be kept in
 * sync instead. Each page still holds its own copy, marked with the saved
 * block it belongs to (`synced` on the copy's outermost block), so every page
 * reads, renders and exports exactly as it always did. When a page is saved,
 * a copy that was changed on it becomes the saved block's content and is
 * written into every other copy, on every page.
 *
 * What is shared is what the block is — its type, its props, its frame and
 * motion, and everything inside it. Where it sits is each page's own: the
 * copy's id, its depth and its column are left alone.
 *
 * The one hazard is an editor that loaded a copy before somebody changed it
 * elsewhere. Saving that page for any reason would send the old copy back,
 * and it would look like an edit. So the editor says which version of each
 * synced block it started from (`baseOf`), and a copy still at that version
 * is one nobody touched: the server brings it up to date instead of taking it
 * as the new content.
 *
 * No dependencies: the editor and the save route both use this.
 */
import type { BaseBlock } from "@/types";
import { withFreshIds } from "./tree-utils";

/** A saved block's id, as the marker on a copy may name it. */
export const SYNCED_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The marker, repaired: a saved block's id, or nothing. */
export function normalizeSyncedId(raw: unknown): string | undefined {
  return typeof raw === "string" && SYNCED_ID.test(raw) ? raw : undefined;
}

/** What every copy shares, without the ids that only have to be unique on one page. */
function shared(block: BaseBlock): unknown {
  const walk = (b: BaseBlock): unknown => ({
    type: b.type,
    props: b.props ?? {},
    ...(b.box ? { box: b.box } : {}),
    ...(b.motion ? { motion: b.motion } : {}),
    ...(b.children?.length ? { children: b.children.map((c) => ({ ...(walk(c) as object), ...(c.column !== undefined ? { column: c.column } : {}), ...(c.layer ? { layer: c.layer } : {}) })) } : {}),
  });
  return walk(block);
}

/** A stable text of what a copy is, for comparing two copies. */
export function canonicalOf(block: BaseBlock): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((value as Record<string, unknown>)[k])]),
      );
    }
    return value;
  };
  return JSON.stringify(sort(shared(block)));
}

/** A short fingerprint of a copy's content: FNV-1a over its canonical text. */
export function baseOf(block: BaseBlock): string {
  const text = canonicalOf(block);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Every synced copy in a tree, outermost only: one inside another is part of it. */
export function syncedCopies(tree: BaseBlock[]): BaseBlock[] {
  const out: BaseBlock[] = [];
  const walk = (list: BaseBlock[] | undefined) => {
    for (const b of list ?? []) {
      if (b.synced) out.push(b);
      else walk(b.children);
    }
  };
  walk(tree);
  return out;
}

/** The version each synced block is at in a tree, by saved block id — what the editor sends. */
export function basesOf(tree: BaseBlock[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const copy of syncedCopies(tree)) if (!(copy.synced! in out)) out[copy.synced!] = baseOf(copy);
  return out;
}

/**
 * `content` put in the place of a copy: the copy's own id, depth, column and
 * marker kept, everything inside given new ids so two copies on one page
 * never share one.
 */
export function placeCopy(copy: BaseBlock, content: BaseBlock): BaseBlock {
  const next: BaseBlock = {
    ...content,
    id: copy.id,
    synced: copy.synced,
    children: content.children?.map(withFreshIds),
  };
  if (!next.children?.length) delete next.children;
  if (copy.layer) next.layer = copy.layer;
  else delete next.layer;
  if (copy.column !== undefined) next.column = copy.column;
  else delete next.column;
  return next;
}

/** A tree with every copy of one synced block made `content`, and whether anything moved. */
export function replaceCopies(tree: BaseBlock[], id: string, content: BaseBlock, except?: string): { tree: BaseBlock[]; changed: boolean } {
  let changed = false;
  const want = canonicalOf(content);
  const walk = (list: BaseBlock[]): BaseBlock[] =>
    list.map((b) => {
      if (b.synced === id) {
        if (b.id === except || canonicalOf(b) === want) return b;
        changed = true;
        return placeCopy(b, content);
      }
      return b.children ? { ...b, children: walk(b.children) } : b;
    });
  const next = walk(tree);
  return { tree: changed ? next : tree, changed };
}

/**
 * The same block placed twice on one page, kept the same while it is edited.
 *
 * Called with the tree before and after an edit: a copy that changed is
 * written into the other copies of the same synced block on this page, so
 * the page never holds two versions of it, which a save could not choose
 * between.
 */
export function syncCopiesOnPage(before: BaseBlock[], after: BaseBlock[]): BaseBlock[] {
  const was = new Map(syncedCopies(before).map((b) => [b.id, canonicalOf(b)]));
  let tree = after;
  for (const copy of syncedCopies(after)) {
    const previous = was.get(copy.id);
    if (previous === undefined || previous === canonicalOf(copy)) continue;
    tree = replaceCopies(tree, copy.synced!, copy, copy.id).tree;
  }
  return tree;
}
