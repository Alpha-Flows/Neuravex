"use client";
import { DividerProps } from "@/types";

interface Props {
  props: DividerProps;
  onChange?: (next: DividerProps) => void;
  disabled?: boolean;
}

export function Divider({ props, disabled }: Props) {
  return (
    <hr
      style={{
        borderStyle: props.style,
        borderColor: props.color,
        borderWidth: 0,
        borderTopWidth: props.thickness,
      }}
    />
  );
}
