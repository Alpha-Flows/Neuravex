"use client";
import { BaseBlock } from "@/types";
import { BlockView } from "@/components/blocks/BlockView";

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
    <>
      {blocks.map((b) =>
        // A section spans the window and lays out its own inside; anything else
        // placed straight on the page belongs in the page's content column,
        // lined up with the header and the footer rather than jammed against
        // the edge of the window.
        b.type === "section" ? (
          <BlockView key={b.id} block={b} disabled pageId={pageId} />
        ) : (
          <div key={b.id} className="nvx-site-column">
            <BlockView block={b} disabled pageId={pageId} />
          </div>
        ),
      )}
    </>
  );
}
