"use client";
import type { SliderProps } from "@/types";

interface Props {
  props: SliderProps;
  onChange?: (next: SliderProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

// Placeholder until the block is written.
export function Slider({ props }: Props) {
  return <div data-block-stub="slider">{`${props.slides.length} slides`}</div>;
}
