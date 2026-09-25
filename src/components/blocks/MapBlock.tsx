"use client";
import type { MapProps } from "@/types";

interface Props {
  props: MapProps;
  onChange?: (next: MapProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function MapBlock({ props }: Props) {
  return <div data-block-stub="map">{props.address}</div>;
}
