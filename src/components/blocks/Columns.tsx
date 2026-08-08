"use client";
import { BaseBlock, ColumnsProps } from "@/types";
import { SortableContainer } from "./Sortable";
import { distributeLeftToRight } from "@/lib/tree-utils";

interface Props {
  props: ColumnsProps;
  childBlocks?: BaseBlock[];
  onChildrenChange?: (next: BaseBlock[]) => void;
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
  const cols = props.count;
  const buckets = distributeLeftToRight(childBlocks ?? [], cols);

  function bucketIndexOf(id: string): number {
    return buckets.findIndex((b) => b.some((x) => x.id === id));
  }

  function rebuild(bucketIdx: number, next: BaseBlock[]) {
    buckets[bucketIdx] = next;
    const merged: BaseBlock[] = [];
    for (let k = 0; k < cols; k++) for (const item of buckets[k]) merged.push(item);
    onChildrenChange?.(merged);
  }

  function deleteFromBuckets(id: string) {
    const idx = bucketIndexOf(id);
    if (idx < 0) return;
    rebuild(idx, buckets[idx].filter((b) => b.id !== id));
  }

  function duplicateInBuckets(id: string) {
    const idx = bucketIndexOf(id);
    if (idx < 0) return;
    const source = buckets[idx].find((b) => b.id === id);
    if (!source) return;
    const copy: BaseBlock = {
      ...JSON.parse(JSON.stringify(source)),
      id: source.id + "-dup-" + Math.random().toString(36).slice(2, 6),
    };
    const list = buckets[idx].slice();
    const at = list.findIndex((b) => b.id === id);
    list.splice(at + 1, 0, copy);
    rebuild(idx, list);
  }

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: props.gap,
      }}
    >
      {buckets.map((bucket, i) => (
        <div key={i} className="min-w-0">
          <SortableContainer
            containerId={`col-${blockId}-${i}`}
            blocks={bucket}
            onChange={(next) => rebuild(i, next)}
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
  );
}
