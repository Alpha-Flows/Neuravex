"use client";
import { Editable } from "./Editable";
import { HeadingProps } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  props: HeadingProps;
  onChange?: (next: HeadingProps) => void;
  disabled?: boolean;
}

const sizeClass: Record<HeadingProps["level"], string> = {
  1: "text-5xl md:text-6xl leading-tight",
  2: "text-4xl md:text-5xl leading-tight",
  3: "text-2xl md:text-3xl leading-snug",
  4: "text-xl md:text-2xl leading-snug",
};

const weightClass: Record<HeadingProps["weight"], string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

export function Heading({ props, onChange, disabled }: Props) {
  const Tag = (`h${props.level}` as unknown) as keyof JSX.IntrinsicElements;
  return (
    <Editable
      as={Tag as any}
      disabled={disabled}
      value={props.text}
      onChange={(text) => onChange?.({ ...props, text })}
      placeholder="Heading"
      className={cn(sizeClass[props.level], weightClass[props.weight], alignClass[props.align])}
      // An empty colour is deliberate: the heading then inherits the page's
      // own text colour instead of pinning itself to a hex.
      style={{ color: props.color || undefined }}
    />
  );
}
