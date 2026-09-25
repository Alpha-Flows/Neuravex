"use client";
import type { ReactNode } from "react";
import type { BaseBlock, BlockBox } from "@/types";
import { layerBoxes } from "@/lib/block-layer";
import { boxStyle } from "@/lib/block-box";
import { cn } from "@/lib/utils";

interface Props {
  block: BaseBlock;
  /**
   * True for a block placed straight on the page rather than inside a section
   * or a column. It is held in the site's content column, so a float lines up
   * with the text above it instead of drifting as the window widens.
   */
  inPageColumn?: boolean;
  children: ReactNode;
}

/**
 * A block, placed at its depth.
 *
 * This is the read-only half of what `BlockChrome` does in the editor, and the
 * two share `layerBoxes()` so the published page and the canvas put a block in
 * the same place. A block in the flow at level 0 — which is most of them —
 * comes out of here as the same single element it always was.
 */
export function LayerFrame({ block, inPageColumn, children }: Props) {
  const { outer, inner } = layerBoxes(block);
  const column = !outer && inPageColumn;
  const styled = Object.keys(inner).length > 0;
  const framed = <BlockFrame box={block.box}>{children}</BlockFrame>;

  // An ordinary block in the flow that is not held in the page's column needs
  // nothing said about it — no wrapper, and the markup is what it was before
  // depth existed.
  if (!outer && !column && !styled) return framed;

  const body = (
    <div className={cn(column && "nvx-site-column")} style={styled ? inner : undefined}>
      {framed}
    </div>
  );

  if (!outer) return body;

  return (
    <div className={cn("nvx-layer", inPageColumn && "nvx-site-column")} style={outer}>
      {body}
    </div>
  );
}

/**
 * A block's frame — spacing, border, shadow, fill — on an element of its own,
 * right around the block, on the canvas and the published page alike.
 *
 * Its own element because the ones outside it are already spoken for. The
 * page's column carries the side gutter as padding, so a frame there took the
 * gutter's place and drew its border at the edge of a phone's screen; a
 * floating block's wrapper is positioned by its margin, which a frame's
 * margin would move. Nothing is added for a block without one.
 */
export function BlockFrame({ box, children }: { box?: BlockBox; children: ReactNode }) {
  const style = boxStyle(box);
  if (Object.keys(style).length === 0) return <>{children}</>;
  return (
    <div className="nvx-block-frame" style={style}>
      {children}
    </div>
  );
}

