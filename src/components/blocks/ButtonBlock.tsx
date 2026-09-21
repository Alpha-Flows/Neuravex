"use client";
import { useState } from "react";
import { Editable } from "./Editable";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { ButtonProps } from "@/types";
import { cn } from "@/lib/utils";
import { TOKEN, readableTextOn } from "@/lib/site-theme";
import { cssColor } from "@/lib/css-value";
import { isSafeHref } from "@/lib/url-safety";

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
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

// What a size rounds to when the site has not set a radius of its own.
const sizeRadius: Record<ButtonProps["size"], string> = {
  sm: "0.375rem",
  md: "0.375rem",
  lg: "0.5rem",
};

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

export function ButtonBlock({ props, onChange, disabled }: Props) {
  const [editingLink, setEditingLink] = useState(false);

  // No colour of its own means the site's accent. A filled button takes its
  // text colour from the accent's contrast; an outline or ghost button draws
  // its label in the accent itself — it used to be handed the same #ffffff as
  // a filled one, which on a light page is white text on white.
  const filled = props.variant === "primary" || props.variant === "secondary";
  const ownColor = cssColor(props.color);
  const accent = ownColor ?? TOKEN.accent;
  // A button with its own colour works out its own readable label; only one
  // riding the site accent defers to the accent's contrast token.
  const labelColor =
    cssColor(props.textColor) ??
    (filled ? (ownColor ? readableTextOn(ownColor) : TOKEN.accentContrast) : accent);

  /**
   * The address this button goes to, checked here as well as at the door.
   *
   * Every write path validates the scheme now — but a row written before that
   * existed is still in people's databases, and this is the element visitors
   * click most. On the exported site there is no CSP behind it.
   */
  const href = isSafeHref(props.href);

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
        background: filled ? accent : "transparent",
        color: labelColor,
        borderColor: props.variant === "outline" || props.variant === "secondary" ? accent : undefined,
        borderRadius: TOKEN.radius(sizeRadius[props.size]),
      }}
    />
  );

  if (disabled) {
    return <div className={alignClass[props.align]}>{href ? <a href={href}>{inner}</a> : inner}</div>;
  }

  return (
    // The link control hangs below the button instead of taking a line of its
    // own: as part of the flow it pushed the rest of the page down, so the
    // canvas never matched what was published.
    <div className={cn(alignClass[props.align], "relative")}>
      {inner}
      <div className="absolute left-0 top-full z-10 inline-block">
        <button
          type="button"
          className="nvx-block-chrome block text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap"
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
