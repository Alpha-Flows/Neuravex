"use client";
import type { GalleryProps } from "@/types";

interface Props {
  props: GalleryProps;
  onChange?: (next: GalleryProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function Gallery({ props }: Props) {
  return <div data-block-stub="gallery">{`${props.images.length} pictures`}</div>;
}
