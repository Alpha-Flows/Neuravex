"use client";
import { useState } from "react";
import { Editable } from "./Editable";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { ButtonProps } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  props: ButtonProps;
  onChange?: (next: ButtonProps) => void;
  disabled?: boolean;
}

const variantClass: Record<ButtonProps["variant"], string> = {
  primary: "shadow-sm",
  secondary: "border",
  outline: "border-2 bg-transparent",
  ghost: "bg-transparent",
};

const sizeClass: Record<ButtonProps["size"], string> = {
  sm: "h-9 px-4 text-sm rounded-md",
  md: "h-11 px-5 text-sm rounded-md",
  lg: "h-12 px-6 text-base rounded-lg",
};

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

export function ButtonBlock({ props, onChange, disabled }: Props) {
  const [editingLink, setEditingLink] = useState(false);

  const inner = (
    <Editable
      as="span"
      disabled={disabled}
      value={props.label}
      onChange={(label) => onChange?.({ ...props, label })}
      placeholder="Button text"
      className={cn(
        "inline-flex items-center justify-center font-medium transition-opacity",
        sizeClass[props.size],
        variantClass[props.variant],
        !disabled && "cursor-text",
      )}
      style={{
        background: props.variant === "primary" || props.variant === "secondary" ? props.color : "transparent",
        color: props.textColor,
        borderColor: props.variant === "outline" || props.variant === "secondary" ? props.color : undefined,
      }}
    />
  );

  if (disabled) {
    return <div className={alignClass[props.align]}>{props.href ? <a href={props.href}>{inner}</a> : inner}</div>;
  }

  return (
    <div className={cn(alignClass[props.align], "space-y-1")}>
      {inner}
      <div className="relative inline-block">
        <button
          type="button"
          className="block text-xs text-slate-400 hover:text-slate-600"
          onClick={(e) => { e.stopPropagation(); setEditingLink(true); }}
        >
          {props.href || "Set link"} ↗
        </button>
        {editingLink ? (
          <InlineEdit
            label="Link URL"
            value={props.href}
            placeholder="https://example.com"
            hint="A full address, a page on this site, or #section for a spot on this page."
            onSave={(href) => { onChange?.({ ...props, href }); setEditingLink(false); }}
            onCancel={() => setEditingLink(false)}
            className="left-0 top-full"
          />
        ) : null}
      </div>
    </div>
  );
}
