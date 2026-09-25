"use client";
import type { TableProps } from "@/types";

interface Props {
  props: TableProps;
  onChange?: (next: TableProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

// Placeholder until the block is written.
export function TableBlock({ props }: Props) {
  return <div data-block-stub="table">{`${props.rows.length} rows`}</div>;
}
