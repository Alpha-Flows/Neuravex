"use client";
import type { AudioProps } from "@/types";

interface Props {
  props: AudioProps;
  onChange?: (next: AudioProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

// Placeholder until the block is written.
export function AudioBlock({ props }: Props) {
  return <div data-block-stub="audio">{props.title}</div>;
}
