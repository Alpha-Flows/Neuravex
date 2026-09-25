/**
 * The server's half of synced blocks: what happens to them when a page is
 * saved. See `synced-blocks.ts` for what a synced block is.
 *
 * Apart from `synced-blocks` because it talks to the database, and that file
 * is imported by the editor, where a Prisma client cannot go.
 */
import type { BaseBlock } from "@/types";
import { prisma } from "./prisma";
import { normalizeBlockTree } from "./block-tree";
import { baseOf, canonicalOf, replaceCopies, syncedCopies } from "./synced-blocks";

/** The saved block a row holds, validated, or null. */
function storedBlock(content: string): BaseBlock | null {
  try {
    const checked = normalizeBlockTree([JSON.parse(content)]);
    return checked.ok && checked.tree.length > 0 ? checked.tree[0] : null;
  } catch {
    return null;
  }
}

/** A tree with the marker taken off every copy of a saved block that is gone or no longer synced. */
function unmark(tree: BaseBlock[], id: string): BaseBlock[] {
  return tree.map((b) => {
    if (b.synced === id) {
      const { synced: _dropped, ...rest } = b;
      return rest;
    }
    return b.children ? { ...b, children: unmark(b.children, id) } : b;
  });
}

export interface SyncedOutcome {
  /** The page's tree as it should be stored. */
  tree: BaseBlock[];
  /** Whether it differs from the tree that was sent. */
  changed: boolean;
  /** Synced blocks brought up to date on this page, by id, for the editor to show. */
  refreshed: Record<string, BaseBlock>;
  /** How many other pages had their copies rewritten. */
  propagated: number;
}

/**
 * The synced copies on a page being saved, settled.
 *
 * For each synced block on the page: a copy the same as the saved block needs
 * nothing. A copy still at the version the editor started from (`bases`) is
 * one nobody touched on this page, and it is brought up to date. Any other
 * copy was edited here — it becomes the saved block, and every copy on every
 * other page is rewritten to match. A copy of a saved block that has been
 * deleted, or is no longer synced, simply loses its marker.
 */
export async function settleSyncedBlocks(
  pageId: string,
  tree: BaseBlock[],
  bases: Record<string, string> | undefined,
): Promise<SyncedOutcome> {
  const outcome: SyncedOutcome = { tree, changed: false, refreshed: {}, propagated: 0 };
  const ids = [...new Set(syncedCopies(tree).map((c) => c.synced!))];
  if (ids.length === 0) return outcome;
  const rows = await prisma.savedBlock.findMany({ where: { id: { in: ids } } });

  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    const stored = row?.synced ? storedBlock(row.content) : null;
    if (!row || !row.synced || !stored) {
      outcome.tree = unmark(outcome.tree, id);
      outcome.changed = true;
      continue;
    }
    const copy = syncedCopies(outcome.tree).find((c) => c.synced === id)!;
    if (canonicalOf(copy) === canonicalOf(stored)) continue;

    const untouched = bases?.[id] !== undefined && bases[id] === baseOf(copy);
    if (untouched) {
      const next = replaceCopies(outcome.tree, id, stored);
      outcome.tree = next.tree;
      outcome.changed ||= next.changed;
      outcome.refreshed[id] = stored;
      continue;
    }

    // Edited on this page: this copy is the synced block from now on.
    const { synced: _m, layer: _l, column: _c, ...content } = copy;
    await prisma.savedBlock.update({ where: { id }, data: { content: JSON.stringify(content), type: copy.type } });
    const same = replaceCopies(outcome.tree, id, copy, copy.id);
    outcome.tree = same.tree;
    outcome.changed ||= same.changed;

    const others = await prisma.page.findMany({
      where: { id: { not: pageId }, content: { contains: `"synced":"${id}"` } },
      select: { id: true, content: true },
    });
    for (const other of others) {
      const checked = normalizeBlockTree(other.content || "[]");
      if (!checked.ok) continue;
      const next = replaceCopies(checked.tree, id, copy);
      if (!next.changed) continue;
      await prisma.page.update({ where: { id: other.id }, data: { content: JSON.stringify(next.tree) } });
      outcome.propagated += 1;
    }
  }
  return outcome;
}
