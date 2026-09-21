"use client";
import { SpacerProps } from "@/types";
import { cssLength } from "@/lib/css-value";

interface Props {
  props: SpacerProps;
  onChange?: (next: SpacerProps) => void;
  disabled?: boolean;
}

export function Spacer({ props, disabled }: Props) {
  // A spacer is deliberately invisible, so the editor has to draw something —
  // but only while you are pointing at it. Hatching it at all times put a band
  // across the canvas that the page itself never has, which is exactly the
  // sort of thing that made the canvas and the preview look like two
  // different pages. Hovering the block still shows what is there.
  return (
    <div style={{ height: cssLength(props.height) ?? "40px" }} className={disabled ? undefined : "relative"}>
      {!disabled ? (
        <div className="nvx-block-chrome absolute inset-0 rounded bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(99,102,241,0.14)_6px_12px)]" />
      ) : null}
    </div>
  );
}
