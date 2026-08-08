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
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} disabled pageId={pageId} />
      ))}
    </>
  );
}
