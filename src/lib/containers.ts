import { BaseBlock } from "@/types";
import { getBlockDefinition } from "@/lib/blocks";
import { columnCount, CONTAINER_TYPES } from "@/lib/tree-utils";

/**
 * Every place on a page that can hold a block, named so a person can pick one.
 *
 * Dragging is how a block moves between containers, and it covers everything
 * except the case this exists for: a floating block. A float is placed rather
 * than ordered — it sits over its container at a position of its own — so its
 * handle already means "move it across the page", and `Sortable.tsx` switches
 * the sortable off rather than give one gesture two meanings. The cost was
 * that a float could not leave the container it was created in at all: you had
 * to put it back in the flow, drag it, and float it again, losing its position
 * both times.
 *
 * So the containers get named instead, and the inspector offers the list.
 *
 * The ids are the ones the rest of the editor already uses — `page`,
 * `section-<id>`, `col-<id>-<n>` — so moving is `removeFromContainer` and
 * `insertIntoContainer`, the same two calls a drag makes.
 */

export interface ContainerChoice {
  /** What `updateContainer` and friends address this container by. */
  id: string;
  /** What the picker shows: "Page", "Section 2", "Columns 1 · column 3". */
  label: string;
  /** How deeply nested it is, for indenting the list. */
  depth: number;
}

/** The name the palette gives this kind of block, so the two agree. */
function kindOf(block: BaseBlock): string {
  return getBlockDefinition(block.type)?.label ?? block.type;
}

/**
 * The containers a block may be moved into, in the order they appear.
 *
 * `exclude` is the block being moved. A container inside it is not a place it
 * can go — a section dropped into its own descendant would take the rest of
 * the page with it and leave a tree that cannot be rendered — so its whole
 * subtree is left out, along with the container it is already in, which is
 * offered as the current selection rather than as somewhere to go.
 */
export function containerChoices(blocks: BaseBlock[], exclude?: string): ContainerChoice[] {
  const out: ContainerChoice[] = [{ id: "page", label: "Page", depth: 0 }];
  const seen = new Map<string, number>();

  /** "Section", "Section 2", "Section 3" — counted across the whole page. */
  function name(block: BaseBlock): string {
    const kind = kindOf(block);
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return n === 1 ? kind : `${kind} ${n}`;
  }

  /**
   * `dropped` is whether we are inside the excluded block. The walk carries on
   * through it rather than stopping, so what a container is called does not
   * depend on which block is being moved — "Section 2" is the second section
   * on the page whoever is asking.
   */
  function walk(list: BaseBlock[], depth: number, dropped: boolean) {
    for (const block of list) {
      const skip = dropped || block.id === exclude;

      if (block.type === "columns") {
        const label = name(block);
        const cols = columnCount(block);
        if (!skip) {
          for (let i = 0; i < cols; i++) {
            out.push({ id: `col-${block.id}-${i}`, label: `${label} · column ${i + 1}`, depth: depth + 1 });
          }
        }
        if (block.children?.length) walk(block.children, depth + 2, skip);
        continue;
      }

      // Anything that can hold children is somewhere a block can be put,
      // including one that is empty — which is often exactly where you want
      // to put the first thing, and which carries no `children` array at all
      // once it has been through the validator.
      if (CONTAINER_TYPES.has(block.type) || Array.isArray(block.children)) {
        const label = name(block);
        if (!skip) out.push({ id: `section-${block.id}`, label, depth: depth + 1 });
        if (block.children?.length) walk(block.children, depth + 2, skip);
      }
    }
  }

  walk(blocks, 0, false);
  return out;
}
