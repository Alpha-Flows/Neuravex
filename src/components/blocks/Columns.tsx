"use client";
import { BaseBlock, ColumnsProps } from "@/types";
import { SortableContainer } from "./Sortable";
import { clampColumnCount, cloneTree, flattenColumns, groupIntoColumns, withFreshIds } from "@/lib/tree-utils";
import { cn } from "@/lib/utils";

interface Props {
  props: ColumnsProps;
  childBlocks?: BaseBlock[];
  onChildrenChange?: (next: BaseBlock[], editKey?: string) => void;
  onSelect?: (id: string | null) => void;
  onChildDelete?: (id: string) => void;
  onChildDuplicate?: (id: string) => void;
  selectedId?: string | null;
  disabled?: boolean;
  blockId: string;
}

export function Columns({
  props,
  childBlocks,
  onChildrenChange,
  onSelect,
  onChildDelete,
  onChildDuplicate,
  selectedId,
  disabled,
  blockId,
}: Props) {
  // Imported or hand-edited content can carry a missing or out-of-range count;
  // rendering `repeat(undefined, ...)` collapsed the whole block.
  const cols = clampColumnCount(props.count);
  const buckets = groupIntoColumns(childBlocks ?? [], cols);

  function bucketIndexOf(id: string): number {
    return buckets.findIndex((b) => b.some((x) => x.id === id));
  }

  function commit(next: BaseBlock[][], editKey?: string) {
    onChildrenChange?.(flattenColumns(next), editKey);
  }

  function rebuild(bucketIdx: number, next: BaseBlock[], editKey?: string) {
    const copy = buckets.map((b) => b.slice());
    copy[bucketIdx] = next;
    commit(copy, editKey);
  }

  function deleteFromBuckets(id: string) {
    const idx = bucketIndexOf(id);
    if (idx < 0) { onChildDelete?.(id); return; }
    rebuild(idx, buckets[idx].filter((b) => b.id !== id));
  }

  function duplicateInBuckets(id: string) {
    const idx = bucketIndexOf(id);
    if (idx < 0) { onChildDuplicate?.(id); return; }
    const source = buckets[idx].find((b) => b.id === id);
    if (!source) return;
    // Every descendant needs a fresh id too — only re-labelling the top block
    // left a duplicated section sharing its children's ids with the original,
    // which breaks selection and drag-and-drop for both copies.
    const copy = withFreshIds(cloneTree(source));
    const list = buckets[idx].slice();
    const at = list.findIndex((b) => b.id === id);
    list.splice(at + 1, 0, copy);
    rebuild(idx, list);
  }

  return (
    <div className={cn("nvx-columns", disabled && "nvx-columns-responsive")}>
      <div
        className="nvx-columns-grid"
        data-cols={cols}
        style={{ ["--nvx-cols" as string]: String(cols), gap: props.gap }}
      >
        {buckets.map((bucket, i) => (
          <div key={i} className="min-w-0">
            <SortableContainer
              containerId={`col-${blockId}-${i}`}
              blocks={bucket}
              onChange={(next, editKey) => rebuild(i, next, editKey)}
              onSelect={onSelect ?? (() => {})}
              onDelete={deleteFromBuckets}
              onDuplicate={duplicateInBuckets}
              selectedId={selectedId ?? null}
              disabled={disabled}
              emptyHint="Empty column"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
