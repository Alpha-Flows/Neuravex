"use client";
import { SpacerProps } from "@/types";

interface Props {
  props: SpacerProps;
  onChange?: (next: SpacerProps) => void;
  disabled?: boolean;
}

export function Spacer({ props, disabled }: Props) {
  return (
    <div
      style={{ height: props.height }}
      className={!disabled ? "bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(99,102,241,0.06)_6px_12px)] rounded" : ""}
    />
  );
}
