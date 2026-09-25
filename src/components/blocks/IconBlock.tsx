"use client";
import type { IconProps } from "@/types";

interface Props {
  props: IconProps;
  onChange?: (next: IconProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

// Placeholder until the block is written.
export function IconBlock({ props }: Props) {
  return <div data-block-stub="icon">{props.icon}</div>;
}
