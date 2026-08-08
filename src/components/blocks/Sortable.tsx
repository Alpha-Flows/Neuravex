"use client";
import { ReactNode, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BaseBlock, BlockType } from "@/types";
import { BlockView } from "./BlockView";
import { cn } from "@/lib/utils";

interface BlockChromeProps {
  block: BaseBlock;
  isSelected: boolean;
  sortable: ReturnType<typeof useSortable>;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  children: ReactNode;
}

/**
 * Visual wrapper around an editor block: hover/select outline,
 * floating drag-handle / delete / duplicate buttons on the left.
 */
function BlockChrome({ block, isSelected, sortable, onSelect, onDelete, onDuplicate, children }: BlockChromeProps) {
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.5 : 1,
      }}
      className={cn("editor-block relative group", isSelected && "is-selected")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className="editor-outline" />
      <div
        className={cn(
          "absolute -left-10 top-1.5 flex flex-col gap-1 z-10 transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label="Drag block"
          className="w-7 h-7 rounded-md bg-bg-card border border-bg-border text-fg-muted hover:text-fg flex items-center justify-center cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <span className="leading-none text-xs">⋮⋮</span>
        </button>
        <button
          aria-label="Duplicate block"
          className="w-7 h-7 rounded-md bg-bg-card border border-bg-border text-fg-muted hover:text-fg flex items-center justify-center"
          onClick={onDuplicate}
          title="Duplicate"
        >
          <span className="leading-none text-xs">⎘</span>
        </button>
        <button
          aria-label="Delete block"
          className="w-7 h-7 rounded-md bg-bg-card border border-bg-border text-fg-muted hover:text-red-400 flex items-center justify-center"
          onClick={onDelete}
          title="Delete"
        >
          <span className="leading-none text-xs">✕</span>
        </button>
      </div>
      {children}
    </div>
  );
}

interface SortableBlockProps {
  block: BaseBlock;
  onChange: (next: BaseBlock) => void;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  selectedId: string | null;
  disabled?: boolean;
  pageId?: string;
}

export function SortableBlock({ block, onChange, onSelect, onDelete, onDuplicate, selectedId, disabled, pageId }: SortableBlockProps) {
  const sortable = useSortable({ id: block.id, disabled });
  const isSelected = selectedId === block.id;

  if (disabled) {
    return <BlockView block={block} onChange={onChange} disabled pageId={pageId} />;
  }

  return (
    <BlockChrome
      block={block}
      isSelected={isSelected}
      sortable={sortable}
      onSelect={onSelect}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
    >
      <BlockView block={block} onChange={onChange} pageId={pageId} />
    </BlockChrome>
  );
}

interface ContainerProps {
  containerId: string;
  blocks: BaseBlock[];
  onChange: (next: BaseBlock[]) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  selectedId: string | null;
  disabled?: boolean;
  emptyHint?: string;
  pageId?: string;
  wrap?: (inner: ReactNode) => ReactNode;
}

/**
 * A droppable list of sortable blocks. Provides a drop zone at the end
 * so users can drop from the palette. Container blocks (section/columns)
 * render their own internal SortableContainer for nested drag-and-drop.
 */
export function SortableContainer({
  containerId,
  blocks,
  onChange,
  onSelect,
  onDelete,
  onDuplicate,
  selectedId,
  disabled,
  emptyHint = "Drop a block here",
  wrap,
  pageId,
}: ContainerProps) {
  const drop = useDroppable({ id: `${containerId}::drop-end`, disabled });
  const ids = blocks.map((b) => b.id);

  function updateChild(updated: BaseBlock) {
    onChange(blocks.map((b) => (b.id === updated.id ? updated : b)));
  }

  const list = (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {blocks.length === 0 && !disabled ? (
        <EmptyHint active={drop.isOver} nodeRef={drop.setNodeRef} text={emptyHint} />
      ) : (
        <div className="space-y-3">
          {blocks.map((b) => (
            <SortableBlock
              key={b.id}
              block={b}
              onChange={updateChild}
              onSelect={() => onSelect(b.id)}
              onDelete={() => onDelete(b.id)}
              onDuplicate={() => onDuplicate(b.id)}
              selectedId={selectedId}
              disabled={disabled}
              pageId={pageId}
            />
          ))}
          {!disabled ? (
            <div
              ref={drop.setNodeRef}
              className={cn(
                "h-2 rounded transition-all",
                drop.isOver ? "bg-brand/30 h-6 ring-2 ring-brand/40" : "hover:bg-brand/10",
              )}
            />
          ) : null}
        </div>
      )}
    </SortableContext>
  );

  return wrap ? wrap(list) : list;
}

function EmptyHint({ active, nodeRef, text }: { active: boolean; nodeRef: (el: HTMLElement | null) => void; text: string }) {
  return (
    <div
      ref={(el) => nodeRef(el as any)}
      className={cn(
        "rounded-lg border-2 border-dashed text-sm text-center py-10 transition-colors",
        active ? "border-brand bg-brand/5 text-fg" : "border-bg-border text-fg-subtle",
      )}
    >
      {text}
    </div>
  );
}
