"use client";
import type { ReactNode } from "react";
import type { BaseBlock } from "@/types";
import { layerBoxes } from "@/lib/block-layer";
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

  // An ordinary block in the flow that is not held in the page's column needs
  // nothing said about it — no wrapper, and the markup is what it was before
  // depth existed.
  if (!outer && !column && !styled) return <>{children}</>;

  const body = (
    <div className={cn(column && "nvx-site-column")} style={styled ? inner : undefined}>
      {children}
    </div>
  );

  if (!outer) return body;

  return (
    <div className={cn("nvx-layer", inPageColumn && "nvx-site-column")} style={outer}>
      {body}
    </div>
  );
}
