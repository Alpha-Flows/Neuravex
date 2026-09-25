"use client";
import type { MapProps } from "@/types";

interface Props {
  props: MapProps;
  onChange?: (next: MapProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

// Placeholder until the block is written.
export function MapBlock({ props }: Props) {
  return <div data-block-stub="map">{props.address}</div>;
}
