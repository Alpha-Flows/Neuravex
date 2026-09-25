"use client";
import type { SocialProps } from "@/types";

interface Props {
  props: SocialProps;
  onChange?: (next: SocialProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function SocialLinks({ props }: Props) {
  return <div data-block-stub="social">{`${props.links.length} links`}</div>;
}
