"use client";
import type { AccordionProps } from "@/types";

interface Props {
  props: AccordionProps;
  onChange?: (next: AccordionProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

// Placeholder until the block is written.
export function Accordion({ props }: Props) {
  return <div data-block-stub="accordion">{`${props.items.length} items`}</div>;
}
