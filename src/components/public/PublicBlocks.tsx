"use client";
import { BaseBlock } from "@/types";
import { BlockView } from "@/components/blocks/BlockView";
import { LayerFrame } from "@/components/blocks/LayerFrame";
import { floatsOnly } from "@/lib/block-layer";

interface Props {
  blocks: BaseBlock[];
  pageId?: string;
}

/**
 * Lightweight read-only block renderer for the public site.
 * No dnd-kit, no editor chrome — just the block tree, passed pageId for forms.
 */
export function PublicBlocks({ blocks, pageId }: Props) {
  return (
    // The page's own stack. It is what a floating block is placed against, and
    // it settles which of two overlapping blocks is in front — the same class
    // the canvas uses, so the two draw the page the same way.
    <div className="nvx-block-stack" data-floats-only={floatsOnly(blocks) ? "true" : undefined}>
      {blocks.map((b) => (
        // A section spans the window and lays out its own inside; anything else
        // placed straight on the page belongs in the page's content column,
        // lined up with the header and the footer rather than jammed against
        // the edge of the window.
        <LayerFrame key={b.id} block={b} inPageColumn={b.type !== "section"}>
          <BlockView block={b} disabled pageId={pageId} />
        </LayerFrame>
      ))}
    </div>
  );
}
