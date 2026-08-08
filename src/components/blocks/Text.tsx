"use client";
import { Editable } from "./Editable";
import { TextProps } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  props: TextProps;
  onChange?: (next: TextProps) => void;
  disabled?: boolean;
}

const sizeClass: Record<TextProps["size"], string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
};

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
} as const;

export function Text({ props, onChange, disabled }: Props) {
  return (
    <Editable
      as="p"
      disabled={disabled}
      value={props.text}
      onChange={(text) => onChange?.({ ...props, text })}
      placeholder="Write something…"
      multiline
      className={cn("leading-relaxed", sizeClass[props.size], alignClass[props.align])}
      style={{ color: props.color, whiteSpace: "pre-wrap" }}
    />
  );
}
