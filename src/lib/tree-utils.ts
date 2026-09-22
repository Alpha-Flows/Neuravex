import { BaseBlock } from "@/types";
import { uid } from "@/lib/utils";

export function mapBlocks(blocks: BaseBlock[], fn: (b: BaseBlock) => BaseBlock): BaseBlock[] {
  return blocks.map((b) => {
    const next = fn({ ...b, children: b.children ? mapBlocks(b.children, fn) : undefined });
    return next;
  });
}

export function findInChildren(blocks: BaseBlock[], id: string): BaseBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) { const f = findInChildren(b.children, id); if (f) return f; }
  }
  return null;
}

export function findBlock(blocks: BaseBlock[], id: string): BaseBlock | null { return findInChildren(blocks, id); }

export function cloneTree<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

/**
 * The blocks that hold other blocks.
 *
 * Containerhood used to be implied by a block happening to have a `children`
 * array, which is true of a section right up until it is empty:
 * `normalizeBlockTree` drops an empty array rather than storing it, so a
 * section with nothing in it looked like a block that cannot hold anything,
 * and nothing could be put into it except by dragging onto its drop zone.
 */
export const CONTAINER_TYPES: ReadonlySet<string> = new Set(["section", "columns"]);

export function updateContainer(blocks: BaseBlock[], containerId: string, fn: (list: BaseBlock[]) => BaseBlock[]): BaseBlock[] {
  if (containerId === "page") return fn(blocks);
  return blocks.map((b) => {
    // `b.children ?? []` so an empty container is still a container. The
    // condition keeps the old reading as well as the new one, so nothing that
    // was a drop target stops being one.
    if (`section-${b.id}` === containerId && (b.children || CONTAINER_TYPES.has(b.type))) {
      return { ...b, children: fn(b.children ?? []) };
    }
    if (b.type === "columns" && b.children) {
      const cols = columnCount(b);
      const sub = groupIntoColumns(b.children, cols);
      let touched = false;
      for (let i = 0; i < cols; i++) {
        if (`col-${b.id}-${i}` === containerId) { sub[i] = fn(sub[i]); touched = true; }
      }
      // Not one of this block's own columns — the target may be nested deeper
      // (a section inside a column), so keep walking.
      if (!touched) return { ...b, children: updateContainer(b.children, containerId, fn) };
      return { ...b, children: flattenColumns(sub) };
    }
    if (b.children) return { ...b, children: updateContainer(b.children, containerId, fn) };
    return b;
  });
}

export function removeFromContainer(blocks: BaseBlock[], containerId: string, blockId: string, capture: (b: BaseBlock) => void): BaseBlock[] {
  if (containerId === "page") {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx >= 0) { capture(blocks[idx]); return blocks.filter((_, i) => i !== idx); }
    return blocks;
  }
  return updateContainer(blocks, containerId, (list) => {
    const idx = list.findIndex((b) => b.id === blockId);
    if (idx >= 0) { capture(list[idx]); return list.filter((_, i) => i !== idx); }
    return list;
  });
}

export function insertIntoContainer(blocks: BaseBlock[], containerId: string, block: BaseBlock, index: number | undefined): BaseBlock[] {
  return updateContainer(blocks, containerId, (list) => {
    const copy = list.slice();
    if (index == null || index >= copy.length) copy.push(block);
    else copy.splice(index, 0, block);
    return copy;
  });
}

export function applyOrder(blocks: BaseBlock[], containerId: string, newOrder: string[]): BaseBlock[] {
  return updateContainer(blocks, containerId, (list) => {
    const byId = new Map(list.map((b) => [b.id, b]));
    return newOrder.map((id) => byId.get(id)!).filter(Boolean);
  });
}

export function resolveDrop(overId: string, _blocks: BaseBlock[], parentMap: Map<string, string>, containerMap: Map<string, BaseBlock[]>): { container: string | null; index: number | null } {
  if (overId.endsWith("::drop-end")) return { container: overId.slice(0, -"::drop-end".length), index: null };
  const parent = parentMap.get(overId);
  if (!parent) return { container: null, index: null };
  const list = containerMap.get(parent);
  if (!list) return { container: null, index: null };
  const idx = list.findIndex((b) => b.id === overId);
  return { container: parent, index: idx < 0 ? null : idx };
}

export const MAX_COLUMNS = 4;

/** Clamp a configured column count to something we can actually render. */
export function clampColumnCount(value: unknown): number {
  const raw = Number(value ?? 2);
  if (!Number.isFinite(raw)) return 2;
  return Math.max(1, Math.min(Math.trunc(raw), MAX_COLUMNS));
}

/** The column count a columns block is configured for, clamped to what we render. */
export function columnCount(block: BaseBlock): number {
  return clampColumnCount((block.props as { count?: unknown })?.count);
}

export function clampColumn(index: number, cols: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), cols - 1));
}

/**
 * Where a child lands when it carries no explicit `column`. This is the
 * original index-based split, kept so pages and templates authored before
 * columns were explicit keep the exact layout their author saw.
 */
function legacyColumnOf(index: number, total: number, cols: number): number {
  const per = Math.max(1, Math.ceil(total / cols));
  return Math.min(Math.floor(index / per), cols - 1);
}

/**
 * Split a columns block's flat child list into one bucket per column.
 *
 * A child's own `column` wins. When no child has one, the whole block is
 * still on the legacy index split and is laid out that way — the first edit
 * flattens it back through `flattenColumns`, which stamps every child, so a
 * block converts to explicit placement without moving anything on screen.
 */
export function groupIntoColumns(blocks: BaseBlock[], cols: number): BaseBlock[][] {
  const count = Math.max(1, Math.trunc(cols) || 1);
  const buckets: BaseBlock[][] = Array.from({ length: count }, () => []);
  const hasExplicit = blocks.some((b) => typeof b.column === "number");
  blocks.forEach((b, i) => {
    const target =
      typeof b.column === "number"
        ? clampColumn(b.column, count)
        : hasExplicit
          ? 0
          : legacyColumnOf(i, blocks.length, count);
    buckets[target].push(b);
  });
  return buckets;
}

/**
 * Merge column buckets back into the stored child list, stamping each child
 * with the column it now lives in. Order is column-major so the flat list
 * still reads left-to-right, top-to-bottom.
 */
export function flattenColumns(buckets: BaseBlock[][]): BaseBlock[] {
  const out: BaseBlock[] = [];
  buckets.forEach((bucket, col) => {
    for (const b of bucket) out.push(b.column === col ? b : { ...b, column: col });
  });
  return out;
}

/**
 * Drop a block by id from anywhere in the tree.
 *
 * Branches that do not contain the block are returned as-is. The previous
 * implementation rebuilt every block with `children: (b.children ?? [])`,
 * which stamped an empty `children` array onto every heading, text and image
 * on the page each time anything was deleted, and that bloat was then saved.
 */
export function removeBlock(list: BaseBlock[], id: string): BaseBlock[] {
  let changed = false;
  const out: BaseBlock[] = [];
  for (const b of list) {
    if (b.id === id) {
      changed = true;
      continue;
    }
    if (b.children?.length) {
      const nextChildren = removeBlock(b.children, id);
      if (nextChildren !== b.children) {
        changed = true;
        out.push({ ...b, children: nextChildren });
        continue;
      }
    }
    out.push(b);
  }
  return changed ? out : list;
}

/**
 * Copy a block with a fresh id for it and every descendant.
 *
 * Duplicates used to keep the original id as a prefix and prefix children with
 * their parent's new id, so duplicating a duplicate grew ids without bound.
 */
export function withFreshIds(block: BaseBlock): BaseBlock {
  const copy: BaseBlock = { ...block, id: uid() };
  if (block.children) copy.children = block.children.map(withFreshIds);
  return copy;
}
