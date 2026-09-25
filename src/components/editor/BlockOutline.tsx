"use client";
import { BaseBlock } from "@/types";
import { getBlockDefinition } from "@/lib/blocks";
import { columnCount, groupIntoColumns } from "@/lib/tree-utils";
import { isFloating, layerOf } from "@/lib/block-layer";
import { cn } from "@/lib/utils";

interface Props {
  blocks: BaseBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** A few words from the block itself, so a row is recognisable at a glance. */
function describe(block: BaseBlock): string {
  const props = block.props as Record<string, unknown>;
  const text =
    typeof props.text === "string" && props.text ? props.text
    : typeof props.label === "string" && props.label ? props.label
    : typeof props.title === "string" ? props.title
    : "";
  if (text) {
    // Block text is HTML once it has been formatted.
    const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (plain) return plain.length > 34 ? `${plain.slice(0, 34)}…` : plain;
  }
  if (block.type === "image" && typeof props.alt === "string" && props.alt) return props.alt;
  const count = (key: string, one: string, many: string) => {
    const n = Array.isArray(props[key]) ? (props[key] as unknown[]).length : 0;
    return `${n} ${n === 1 ? one : many}`;
  };
  if (block.type === "gallery") return count("images", "picture", "pictures");
  if (block.type === "slider") return count("slides", "slide", "slides");
  if (block.type === "social") return count("links", "link", "links");
  if (block.type === "pricing") return count("plans", "plan", "plans");
  if (block.type === "table") return count("rows", "row", "rows");
  if (block.type === "accordion") return count("items", "question", "questions");
  if (block.type === "map" && typeof props.address === "string") return props.address.replace(/<[^>]*>/g, "");
  if (block.type === "code") {
    const first = typeof props.code === "string" ? props.code.split("\n")[0].trim() : "";
    return first.length > 34 ? `${first.slice(0, 34)}…` : first;
  }
  if (block.type === "icon" && typeof props.icon === "string") return props.icon;
  if (block.type === "columns") return `${columnCount(block)} columns`;
  if (block.type === "section") return `${block.children?.length ?? 0} inside`;
  return "";
}

interface Row {
  block: BaseBlock;
  depth: number;
  /** Which column of a Columns block this sits in, for the label. */
  column?: number;
}

/** The tree, flattened in the order it is drawn. */
function rows(blocks: BaseBlock[], depth = 0, out: Row[] = []): Row[] {
  for (const block of blocks) {
    out.push({ block, depth });
    if (block.type === "columns" && block.children?.length) {
      groupIntoColumns(block.children, columnCount(block)).forEach((bucket, column) => {
        for (const child of bucket) {
          out.push({ block: child, depth: depth + 1, column });
          if (child.children?.length) rows(child.children, depth + 2, out);
        }
      });
    } else if (block.children?.length) {
      rows(block.children, depth + 1, out);
    }
  }
  return out;
}

/**
 * The page as a list.
 *
 * Once a Section is full of children, clicking the Section itself is fiddly —
 * every click lands on something inside it. Here each block is one row,
 * whatever is on top of it on the canvas.
 */
export function BlockOutline({ blocks, selectedId, onSelect }: Props) {
  const list = rows(blocks);

  if (list.length === 0) {
    return (
      <div className="p-4 text-xs text-fg-muted">
        Nothing on this page yet. Add a block and it appears here.
      </div>
    );
  }

  return (
    <div className="p-2" role="tree" aria-label="Page outline">
      {list.map(({ block, depth, column }) => {
        const def = getBlockDefinition(block.type);
        const detail = describe(block);
        return (
          <button
            key={block.id}
            role="treeitem"
            aria-selected={selectedId === block.id}
            onClick={() => onSelect(block.id)}
            style={{ paddingLeft: 8 + depth * 12 }}
            className={cn(
              "w-full text-left pr-2 py-1.5 rounded-md flex items-center gap-2 text-xs",
              selectedId === block.id ? "bg-brand/15 text-fg" : "text-fg-muted hover:text-fg hover:bg-bg-card",
            )}
          >
            <span aria-hidden className="w-4 shrink-0 text-center text-fg-subtle">{def?.icon ?? "▫"}</span>
            <span className="font-medium shrink-0">{def?.label ?? block.type}</span>
            {column != null ? (
              <span className="text-[10px] text-fg-subtle shrink-0">col {column + 1}</span>
            ) : null}
            {/* A floating block is not where the list says it is — it is over
                whatever it was placed on — and the outline is the one view of
                the page that can say so without you hunting for it. */}
            {isFloating(block) ? (
              <span className="text-[10px] text-brand shrink-0" title="Floats over its neighbours">
                ✥
              </span>
            ) : null}
            {layerOf(block).level !== 0 ? (
              <span className="text-[10px] text-fg-subtle shrink-0" title="Depth level">
                L{layerOf(block).level}
              </span>
            ) : null}
            {detail ? <span className="truncate text-fg-subtle">{detail}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
