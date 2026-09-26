/**
 * Doing one thing to several blocks at once.
 *
 * Every action in the editor took one block: three cards meant three deletes,
 * and putting a heading, its paragraph and its button into a section meant
 * adding the section and then dragging each of them in, one at a time, into a
 * drop zone a few pixels high. These are the same moves made for a set of
 * blocks, and made so that the page cannot end up half-moved: each returns a
 * whole new tree, or null when it would not hold every block it was given.
 *
 * The set is kept in page order, and a block whose section or column is in
 * the set too is left out of it — moving the section already moves it, and
 * moving it as well would take it out of the section it came with.
 */
import type { BaseBlock } from "@/types";
import { columnCount, groupIntoColumns, insertIntoContainer, removeFromContainer, updateContainer } from "./tree-utils";

/** Each block's container, as the editor names containers: "page", "section-<id>", "col-<id>-<n>". */
export function parentsOf(blocks: BaseBlock[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: BaseBlock[], parent: string) => {
    for (const b of list) {
      out.set(b.id, parent);
      if (b.type === "columns" && b.children?.length) {
        groupIntoColumns(b.children, columnCount(b)).forEach((bucket, i) => walk(bucket, `col-${b.id}-${i}`));
      } else if (b.children?.length) {
        walk(b.children, `section-${b.id}`);
      }
    }
  };
  walk(blocks, "page");
  return out;
}

/** The block a container id belongs to, or null for the page. */
function ownerOf(container: string): string | null {
  if (container === "page") return null;
  if (container.startsWith("section-")) return container.slice("section-".length);
  if (container.startsWith("col-")) return container.slice("col-".length, container.lastIndexOf("-"));
  return null;
}

/** Whether `id` sits anywhere inside `ancestor`. */
function isInside(id: string, ancestor: string, parents: Map<string, string>): boolean {
  let owner = ownerOf(parents.get(id) ?? "page");
  while (owner) {
    if (owner === ancestor) return true;
    owner = ownerOf(parents.get(owner) ?? "page");
  }
  return false;
}

/**
 * The selection as it will be acted on: ids that are on the page, in page
 * order, without any that are inside another selected block.
 */
export function selectionInOrder(blocks: BaseBlock[], ids: string[]): string[] {
  const parents = parentsOf(blocks);
  const wanted = new Set(ids.filter((id) => parents.has(id)));
  const order: string[] = [];
  const walk = (list: BaseBlock[]) => {
    for (const b of list) {
      order.push(b.id);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return order.filter((id) => wanted.has(id) && ![...wanted].some((other) => other !== id && isInside(id, other, parents)));
}

/** The blocks with every one of `ids` taken out. */
export function removeMany(blocks: BaseBlock[], ids: string[]): BaseBlock[] {
  const parents = parentsOf(blocks);
  let tree = blocks;
  for (const id of selectionInOrder(blocks, ids)) tree = removeFromContainer(tree, parents.get(id)!, id, () => {});
  return tree;
}

/** The container every one of `ids` is in, when they share one; otherwise null. */
export function sharedContainer(blocks: BaseBlock[], ids: string[]): string | null {
  const parents = parentsOf(blocks);
  const containers = new Set(selectionInOrder(blocks, ids).map((id) => parents.get(id)));
  return containers.size === 1 ? ([...containers][0] ?? null) : null;
}

function everyBlockIn(tree: BaseBlock[], ids: string[]): boolean {
  const parents = parentsOf(tree);
  return ids.every((id) => parents.has(id));
}

/**
 * The selected blocks taken out and put, in page order, at the end of
 * `target`. Null when `target` is one of them or inside one — a section
 * cannot be moved into itself — or when the result would have lost a block.
 */
export function moveManyTo(blocks: BaseBlock[], ids: string[], target: string): BaseBlock[] | null {
  const parents = parentsOf(blocks);
  const chosen = selectionInOrder(blocks, ids);
  if (chosen.length === 0) return null;
  const targetOwner = ownerOf(target);
  if (targetOwner && (chosen.includes(targetOwner) || chosen.some((id) => isInside(targetOwner, id, parents)))) return null;

  let tree = blocks;
  const moved: BaseBlock[] = [];
  for (const id of chosen) tree = removeFromContainer(tree, parents.get(id)!, id, (b) => moved.push(b));
  // A block leaving a columns block takes its column number with it, which
  // means nothing anywhere else and the wrong column in another columns block.
  for (const block of moved) {
    const placed = { ...block };
    delete placed.column;
    tree = insertIntoContainer(tree, target, placed, undefined);
  }
  // `insertIntoContainer` hands the tree back unchanged for a container it
  // cannot find, by which time the blocks have been taken out: that tree
  // would have deleted them.
  return everyBlockIn(tree, chosen) ? tree : null;
}

/**
 * The selected blocks wrapped in `section`, which takes the place of the
 * first of them. They must share a container, so the section has one place
 * to go; null otherwise.
 */
export function wrapInSection(blocks: BaseBlock[], ids: string[], section: BaseBlock): BaseBlock[] | null {
  const container = sharedContainer(blocks, ids);
  if (!container) return null;
  const chosen = selectionInOrder(blocks, ids);
  const wanted = new Set(chosen);
  let column: number | undefined;
  const tree = updateContainer(blocks, container, (list) => {
    const at = list.findIndex((b) => wanted.has(b.id));
    const inside = list.filter((b) => wanted.has(b.id)).map((b) => {
      column ??= b.column;
      const copy = { ...b };
      delete copy.column;
      return copy;
    });
    const wrapper: BaseBlock = { ...section, children: inside, ...(column !== undefined ? { column } : {}) };
    const rest = list.filter((b) => !wanted.has(b.id));
    rest.splice(Math.max(0, at), 0, wrapper);
    return rest;
  });
  return everyBlockIn(tree, [...chosen, section.id]) ? tree : null;
}

/**
 * The list with the block at `index` moved one place up or down, stepping
 * over floating blocks — they take no room in the list, so passing one is no
 * move anyone can see. Null when there is nowhere to go.
 */
export function moveInList(list: BaseBlock[], index: number, direction: -1 | 1): BaseBlock[] | null {
  let to = index + direction;
  while (to >= 0 && to < list.length && list[to].layer?.mode === "float") to += direction;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return null;
  const copy = list.slice();
  const [block] = copy.splice(index, 1);
  copy.splice(to, 0, block);
  return copy;
}

/** The block moved one place up or down in whichever container holds it; see `moveInList`. */
export function moveWithinContainer(blocks: BaseBlock[], id: string, direction: -1 | 1): BaseBlock[] | null {
  const container = parentsOf(blocks).get(id);
  if (!container) return null;
  let moved = false;
  const tree = updateContainer(blocks, container, (list) => {
    const next = moveInList(list, list.findIndex((b) => b.id === id), direction);
    if (!next) return list;
    moved = true;
    return next;
  });
  return moved ? tree : null;
}
