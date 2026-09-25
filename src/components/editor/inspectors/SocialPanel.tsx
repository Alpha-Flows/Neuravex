"use client";
import type { BlockPanelProps } from "../inspector-fields";

// Placeholder until the block's panel is written.
export function SocialPanel({ block }: BlockPanelProps) {
  return <div className="text-xs text-fg-muted">{block.type}</div>;
}
