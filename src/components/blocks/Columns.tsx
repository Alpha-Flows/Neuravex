"use client";
import { BaseBlock, ColumnsProps } from "@/types";
import { SortableContainer } from "./Sortable";
import { flattenColumns, groupIntoColumns } from "@/lib/tree-utils";
import { cn } from "@/lib/utils";

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
  const buckets = groupIntoColumns(childBlocks ?? [], cols);

  function bucketIndexOf(id: string): number {
    return buckets.findIndex((b) => b.some((x) => x.id === id));
  }

  function commit(next: BaseBlock[][]) {
    onChildrenChange?.(flattenColumns(next));
  }

  function rebuild(bucketIdx: number, next: BaseBlock[]) {
    const copy = buckets.map((b) => b.slice());
    copy[bucketIdx] = next;
    commit(copy);
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
    </div>
  );
}
