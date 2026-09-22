"use client";
import type { JSX } from "react";
import { Editable } from "./Editable";
import { HeadingProps } from "@/types";
import { cn } from "@/lib/utils";
import { cssColor } from "@/lib/css-value";

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
      // The tag comes from `level`; how big it is drawn can be set apart from
      // it, so a heading can be an h2 in the outline without being 48px on
      // the page. Unset, the two stay the same thing.
      className={cn(sizeClass[props.size ?? props.level], weightClass[props.weight], alignClass[props.align])}
      // An empty colour is deliberate: the heading then inherits the page's
      // own text colour instead of pinning itself to a hex.
      // A colour, or nothing. React serialises a style object without
      // looking at it, so `red;background:url(https://attacker/x)` used to
      // render as two declarations and the second was a beacon.
      style={{ color: cssColor(props.color) }}
    />
  );
}
