"use client";
import type { CodeProps } from "@/types";

interface Props {
  props: CodeProps;
  onChange?: (next: CodeProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function CodeBlock({ props }: Props) {
  return <div data-block-stub="code">{props.language}</div>;
}
