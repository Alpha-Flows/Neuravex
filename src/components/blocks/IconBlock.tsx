"use client";
import type { IconProps } from "@/types";

interface Props {
  props: IconProps;
  onChange?: (next: IconProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function IconBlock({ props }: Props) {
  return <div data-block-stub="icon">{props.icon}</div>;
}
