"use client";
import { useDraggable } from "@dnd-kit/core";
import { BLOCKS, BlockDefinition } from "@/lib/blocks";
import { BlockType } from "@/types";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onInsert: (type: BlockType) => void;
  /** What is on the clipboard, if anything — "Section", say. */
  pasteLabel?: string | null;
  onPaste?: () => void;
}

const categories: { id: "layout" | "content" | "media"; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "layout", label: "Layout" },
  { id: "media", label: "Media" },
];

export function BlockPalette({ onInsert, pasteLabel, onPaste }: Props) {
  const [query, setQuery] = useState("");
  const filtered = BLOCKS.filter(
    (b) => !query || b.label.toLowerCase().includes(query.toLowerCase()) || b.description.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div>
      <div className="p-4 border-b border-bg-border sticky top-0 bg-bg-soft z-10">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search blocks…"
          className="w-full h-8 px-2.5 rounded-md bg-bg border border-bg-border text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-brand/60"
        />
        <button
          onClick={() => onInsert(BLOCKS[0].type)}
          className="hidden"
          aria-hidden
        />
      </div>
      <div className="p-3 space-y-5">
        {categories.map((cat) => {
          const items = filtered.filter((b) => b.category === cat.id);
          if (items.length === 0) return null;
          return (
            <div key={cat.id}>
              <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium px-1 mb-1.5">{cat.label}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((b) => (
                  <PaletteItem key={b.type} block={b} onInsert={onInsert} />
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="text-xs text-fg-subtle text-center py-4">No blocks match &ldquo;{query}&rdquo;</div>
        ) : null}
      </div>
      {pasteLabel && onPaste ? (
        <div className="px-3 pb-2">
          <button
            onClick={onPaste}
            className="w-full h-8 rounded-md border border-bg-border bg-bg text-xs text-fg-muted hover:text-fg hover:border-brand/60"
          >
            Paste {pasteLabel.toLowerCase()}
          </button>
          <p className="text-[11px] text-fg-subtle mt-1.5 leading-relaxed">
            Copied from this or another page. Cmd/Ctrl+V does the same.
          </p>
        </div>
      ) : null}
      <div className="p-3 text-[11px] text-fg-subtle leading-relaxed">
        Drag a block onto the page, or click it to insert at the end. Copy a block with
        Cmd/Ctrl+C and paste it on any page.
      </div>
    </div>
  );
}

function PaletteItem({ block, onInsert }: { block: BlockDefinition; onInsert: (t: BlockType) => void }) {
  const drag = useDraggable({
    id: `palette::${block.type}`,
    data: { source: "palette", type: block.type },
  });
  const style: React.CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};
  return (
    <button
      ref={drag.setNodeRef}
      style={style}
      {...drag.attributes}
      {...drag.listeners}
      onClick={() => onInsert(block.type)}
      className={cn(
        "group flex flex-col items-start gap-1 p-2.5 rounded-md text-left",
        "border border-bg-border bg-bg hover:border-brand/60 hover:bg-bg-card transition-colors",
        drag.isDragging && "opacity-50",
      )}
      title={block.description}
    >
      <span className="w-6 h-6 rounded bg-bg-card border border-bg-border flex items-center justify-center text-[11px] font-mono text-fg-muted group-hover:text-fg">
        {block.icon}
      </span>
      <span className="text-[12px] text-fg leading-tight">{block.label}</span>
    </button>
  );
}
