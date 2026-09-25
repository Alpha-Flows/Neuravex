"use client";
import type { TableProps } from "@/types";

interface Props {
  props: TableProps;
  onChange?: (next: TableProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function TableBlock({ props }: Props) {
  return <div data-block-stub="table">{`${props.rows.length} rows`}</div>;
}
