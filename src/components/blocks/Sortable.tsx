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
  /** First block on the page — its controls have no room above, so they sit inside. */
  atTop?: boolean;
  /** Held in the page's content column, as the published page holds it. */
  inPageColumn?: boolean;
  children: ReactNode;
}

/**
 * Visual wrapper around an editor block: hover/select outline, plus a
 * floating drag / duplicate / delete toolbar.
 *
 * The toolbar sits just above the block's top-right corner. It used to hang
 * off the left edge, which does not work in this layout: the canvas fills
 * the pane, so there is no left gutter to hang in. The controls were clipped
 * away entirely for anything in a leftmost column and drew on top of the
 * neighbouring column for everything else. Above-right keeps them reachable
 * for every block and clear of the block's own content, so clicking a block
 * always selects it instead of hitting a button.
 */
function BlockChrome({ block, isSelected, sortable, onSelect, onDelete, onDuplicate, atTop, inPageColumn, children }: BlockChromeProps) {
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.5 : 1,
      }}
      className={cn("editor-block relative group", inPageColumn && "nvx-site-column", isSelected && "is-selected")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className="editor-outline" />
      <div
        className={cn(
          "editor-toolbar absolute right-1 z-20 flex items-center gap-0.5 rounded-md p-0.5",
          "bg-bg-card border border-bg-border shadow-lg transition-opacity",
          atTop ? "top-1" : "-top-8",
          // The toolbar keeps its box when hidden, so it has to stop taking
          // clicks too — otherwise it shadows whatever sits beneath it.
          isSelected
            ? "opacity-100"
            : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label="Drag block"
          className="w-6 h-6 rounded text-fg-muted hover:text-fg hover:bg-bg-soft flex items-center justify-center cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <span className="leading-none text-xs">⋮⋮</span>
        </button>
        <button
          aria-label="Duplicate block"
          className="w-6 h-6 rounded text-fg-muted hover:text-fg hover:bg-bg-soft flex items-center justify-center"
          onClick={onDuplicate}
          title="Duplicate"
        >
          <span className="leading-none text-xs">⎘</span>
        </button>
        <button
          aria-label="Delete block"
          className="w-6 h-6 rounded text-fg-muted hover:text-red-400 hover:bg-bg-soft flex items-center justify-center"
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
  /**
   * `editKey` names the edit so the editor can fold a run of them into one
   * undo step. It is the id of the innermost block that actually changed, so
   * typing in one block never merges with typing in its neighbour.
   */
  onChange: (next: BaseBlock, editKey?: string) => void;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  selectedId: string | null;
  disabled?: boolean;
  pageId?: string;
  // Forwarded into container blocks (section / columns) so the blocks *they*
  // render can be selected, deleted and duplicated too. Without these a
  // nested block's click reaches a no-op and the inspector never opens.
  onSelectId?: (id: string | null) => void;
  onChildDelete?: (id: string) => void;
  onChildDuplicate?: (id: string) => void;
  atTop?: boolean;
  /** Wraps the block in the page's content column. */
  inPageColumn?: boolean;
}

export function SortableBlock({ block, onChange, onSelect, onDelete, onDuplicate, selectedId, disabled, pageId, onSelectId, onChildDelete, onChildDuplicate, atTop, inPageColumn }: SortableBlockProps) {
  const sortable = useSortable({ id: block.id, disabled });
  const isSelected = selectedId === block.id;

  if (disabled) {
    return <BlockView block={block} onChange={onChange} disabled pageId={pageId} />;
  }

  // A change coming out of this block is keyed by this block, unless it
  // bubbled up from a nested one that named itself.
  const report = (next: BaseBlock, editKey?: string) => onChange(next, editKey ?? `edit:${block.id}`);

  return (
    <BlockChrome
      block={block}
      isSelected={isSelected}
      sortable={sortable}
      onSelect={onSelect}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      atTop={atTop}
      inPageColumn={inPageColumn}
    >
      <BlockView
        block={block}
        onChange={report}
        pageId={pageId}
        onSelect={onSelectId}
        onChildDelete={onChildDelete}
        onChildDuplicate={onChildDuplicate}
        selectedId={selectedId}
      />
    </BlockChrome>
  );
}

interface ContainerProps {
  containerId: string;
  blocks: BaseBlock[];
  onChange: (next: BaseBlock[], editKey?: string) => void;
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

  function updateChild(updated: BaseBlock, editKey?: string) {
    onChange(blocks.map((b) => (b.id === updated.id ? updated : b)), editKey);
  }

  const list = (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {blocks.length === 0 && !disabled ? (
        <EmptyHint active={drop.isOver} nodeRef={drop.setNodeRef} text={emptyHint} />
      ) : (
        // No gap between blocks: the published page stacks them flush, and a
        // canvas that spaced them out by 12px was showing a layout nobody would
        // ever get. Hovering outlines a block, which is what makes one
        // distinguishable from the next.
        <div>
          {blocks.map((b, i) => (
            <SortableBlock
              key={b.id}
              atTop={containerId === "page" && i === 0}
              // Straight on the page and not a section: the same content column
              // the published page puts it in, so the canvas is not showing a
              // width the visitor never sees.
              inPageColumn={containerId === "page" && b.type !== "section"}
              block={b}
              onChange={updateChild}
              onSelect={() => onSelect(b.id)}
              onDelete={() => onDelete(b.id)}
              onDuplicate={() => onDuplicate(b.id)}
              onSelectId={onSelect}
              onChildDelete={onDelete}
              onChildDuplicate={onDuplicate}
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
