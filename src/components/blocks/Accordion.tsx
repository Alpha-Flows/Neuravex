"use client";
import type { AccordionProps } from "@/types";

interface Props {
  props: AccordionProps;
  onChange?: (next: AccordionProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function Accordion({ props }: Props) {
  return <div data-block-stub="accordion">{`${props.items.length} items`}</div>;
}
