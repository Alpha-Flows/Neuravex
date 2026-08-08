"use client";
import { useEffect, useRef, useCallback } from "react";
import { FormattingToolbar } from "./FormattingToolbar";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props {
  value: string;
  onChange: (v: string) => void;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}

/**
 * Inline editable element used in the editor. Tracks innerHTML so that
 * bold / italic / links inserted via execCommand are persisted correctly.
 * Public callers pass disabled={true} for a read-only element.
 */
export function Editable({
  value,
  onChange,
  as = "div",
  className,
  disabled,
  placeholder,
  multiline,
  style,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const lastValueRef = useRef<string>(value);

  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
      lastValueRef.current = value;
    }
  }, [value]);

  const report = useCallback(() => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    if (html !== lastValueRef.current) {
      lastValueRef.current = html;
      onChange(html);
    }
  }, [onChange]);

  const Tag = as as any;

  if (disabled) {
    return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />;
  }

  return (
    <>
      <FormattingToolbar onFormat={report} />
      <Tag
        ref={ref as any}
        className={`inline-editable ${className ?? ""}`}
        style={style}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onBlur={report}
        onKeyDown={(e: any) => {
          if (!multiline && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget as HTMLElement).blur();
          }
        }}
      />
    </>
  );
}
