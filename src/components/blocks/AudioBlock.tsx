"use client";
import type { AudioProps } from "@/types";

interface Props {
  props: AudioProps;
  onChange?: (next: AudioProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function AudioBlock({ props }: Props) {
  return <div data-block-stub="audio">{props.title}</div>;
}
