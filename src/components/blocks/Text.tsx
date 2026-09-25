"use client";
import { Editable } from "./Editable";
import { TextProps } from "@/types";
import { cn } from "@/lib/utils";
import { cssColor } from "@/lib/css-value";
import { bodySizeClass } from "@/lib/text-styles";

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
      // The site's body size, when it has one, reaches the text through the
      // second class; see `textStylesCss`.
      className={cn("leading-relaxed", sizeClass[props.size], bodySizeClass(props.size), alignClass[props.align])}
      style={{ color: cssColor(props.color), whiteSpace: "pre-wrap" }}
    />
  );
}
