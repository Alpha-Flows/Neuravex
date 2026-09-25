"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BaseBlock, BlockLayer, BlockType } from "@/types";
import { BlockView } from "./BlockView";
import { BlockFrame, LayerFrame } from "./LayerFrame";
import { clampOffset, clampWidth, floatsOnly, layerBoxes, layerOf } from "@/lib/block-layer";
import { cn } from "@/lib/utils";

interface BlockChromeProps {
  block: BaseBlock;
  isSelected: boolean;
  sortable: ReturnType<typeof useSortable>;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Move or resize this block's float. Absent when the block is in the flow. */
  onLayerChange?: (patch: Partial<BlockLayer>) => void;
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
 *
 * It also places the block at its depth, through the same `layerBoxes()` the
 * published page uses. For a block in the flow that is nothing but a z-index;
 * for a floating one it is a wrapper the block is positioned inside, and the
 * drag handle then moves it rather than reordering it — there is no order to
 * change when a block takes no room in the list.
 */
function BlockChrome({ block, isSelected, sortable, onSelect, onDelete, onDuplicate, onLayerChange, atTop, inPageColumn, children }: BlockChromeProps) {
  const { outer, inner } = layerBoxes(block);
  const placed = layerOf(block);
  const floating = outer !== null;
  const outerRef = useRef<HTMLDivElement | null>(null);
  /**
   * Where the block is while it is being dragged. Held here rather than
   * reported on every pointer move: a drag is one change to the page, and
   * writing each frame into the page's history would cost a second of undo
   * presses to get back to where the block started.
   */
  const [live, setLive] = useState<{ x: number; y: number; width: number } | null>(null);
  const stopDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDragRef.current?.(), []);

  const shown = live ?? placed;
  const outerStyle = outer ? { ...outer, top: `${shown.y}%` } : undefined;
  const innerStyle = floating
    ? { ...inner, marginLeft: `${shown.x}%`, width: `${shown.width}%` }
    : inner;

  /**
   * Dragging a float, in the units it is stored in.
   *
   * Both handles measure against the same two boxes the layout uses: the width
   * a percentage offset resolves against is the wrapper's content box, and the
   * height `y` resolves against is the stack the wrapper is positioned in. Read
   * once when the drag starts — neither can change while a block that takes no
   * room in the flow is being moved around.
   */
  function beginDrag(e: React.PointerEvent, kind: "move" | "resize") {
    if (!onLayerChange) return;
    const wrapper = outerRef.current;
    const stack = wrapper?.offsetParent as HTMLElement | null;
    if (!wrapper || !stack) return;
    const style = getComputedStyle(wrapper);
    const refWidth = wrapper.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const refHeight = stack.clientHeight;
    if (refWidth <= 0 || refHeight <= 0) return;

    e.preventDefault();
    e.stopPropagation();
    onSelect();

    const startX = e.clientX;
    const startY = e.clientY;
    const from = { x: placed.x, y: placed.y, width: placed.width };
    let latest = from;

    const onMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / refWidth) * 100;
      const dy = ((ev.clientY - startY) / refHeight) * 100;
      latest =
        kind === "move"
          ? { ...from, x: clampOffset(from.x + dx), y: clampOffset(from.y + dy) }
          : { ...from, width: clampWidth(from.width + dx) };
      setLive(latest);
    };
    const finish = () => {
      stopDragRef.current?.();
      setLive(null);
      if (latest !== from) {
        onLayerChange(kind === "move" ? { x: latest.x, y: latest.y } : { width: latest.width });
      }
    };
    stopDragRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      stopDragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const body = (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.5 : 1,
        ...innerStyle,
      }}
      className={cn(
        "editor-block relative group",
        !floating && inPageColumn && "nvx-site-column",
        floating && "is-floating",
        isSelected && "is-selected",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* The selection / hover ring. It is positioned over the block rather
          than sitting in front of it: as an ordinary element it was 0px tall,
          so it drew a dashed line across the top edge instead of a box round
          the block you were about to click. */}
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
        {block.synced ? (
          // Said on the block itself: editing a synced copy changes every page
          // it is on, which is not something to find out afterwards.
          <span title="Synced block — the same on every page it is on" className="px-1 text-[10px] text-brand" data-synced-badge="">
            ⟳ Synced
          </span>
        ) : null}
        {floating ? (
          // A float has no place in the order, so the handle moves it instead.
          <button
            onPointerDown={(e) => beginDrag(e, "move")}
            aria-label="Move block"
            className="w-6 h-6 rounded text-fg-muted hover:text-fg hover:bg-bg-soft flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
            title="Drag to place it over the page"
          >
            <span className="leading-none text-xs">✥</span>
          </button>
        ) : (
          <button
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label="Drag block"
            className="w-6 h-6 rounded text-fg-muted hover:text-fg hover:bg-bg-soft flex items-center justify-center cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <span className="leading-none text-xs">⋮⋮</span>
          </button>
        )}
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
      <BlockFrame box={block.box}>{children}</BlockFrame>
      {floating ? (
        // Width, dragged. A float is sized as a share of the area it floats in,
        // and typing 43 into the inspector is a poor way to find out which
        // share puts the words where you want them.
        <button
          onPointerDown={(e) => beginDrag(e, "resize")}
          aria-label="Resize block"
          title="Drag to set how wide it is"
          className={cn(
            "nvx-block-chrome absolute top-1/2 -right-1.5 -translate-y-1/2 z-20 w-3 h-8 rounded-sm touch-none",
            "bg-brand/80 border border-white/40 shadow cursor-ew-resize",
          )}
        />
      ) : null}
    </div>
  );

  if (!outerStyle) return body;

  return (
    <div ref={outerRef} className={cn("nvx-layer", inPageColumn && "nvx-site-column")} style={outerStyle}>
      {body}
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
  const floating = block.layer?.mode === "float";
  // A floating block is placed, not ordered: dragging it to a different point
  // in a list it does not occupy would move nothing anyone can see. Its handle
  // moves it across the page instead, so the sortable is switched off.
  const sortable = useSortable({ id: block.id, disabled: disabled || floating });
  const isSelected = selectedId === block.id;

  if (disabled) {
    return (
      <LayerFrame block={block} inPageColumn={inPageColumn}>
        <BlockView block={block} onChange={onChange} disabled pageId={pageId} />
      </LayerFrame>
    );
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
      onLayerChange={(patch) =>
        onChange({ ...block, layer: { ...layerOf(block), ...patch } }, `layer:${block.id}`)
      }
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
        // `nvx-block-stack` makes this the frame a floating block is placed
        // against and the stacking context depth is settled in — the same
        // class the published page puts round the same list of blocks — and
        // gives the end-of-list drop target below something to be pinned to.
        <div className="nvx-block-stack" data-floats-only={floatsOnly(blocks) ? "true" : undefined}>
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
            // Where a block dropped at the end of this container lands. It
            // hangs off the bottom edge rather than sitting in the flow — an
            // 8px strip after every container was 8px the published page does
            // not have, and they added up through every nested section and
            // column. dnd-kit finds it by its measured rectangle rather than
            // by pointer events, so it can stay transparent to clicks and
            // never shadow what sits below it.
            <div
              ref={drop.setNodeRef}
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-full z-10 pointer-events-none rounded transition-all",
                drop.isOver ? "h-6 bg-brand/30 ring-2 ring-brand/40" : "h-2",
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
