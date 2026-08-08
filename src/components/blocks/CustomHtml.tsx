"use client";
import { HtmlProps } from "@/types";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props {
  props: HtmlProps;
  onChange?: (next: HtmlProps) => void;
  disabled?: boolean;
}

export function CustomHtml({ props, onChange, disabled }: Props) {
  if (disabled) {
    return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }} />;
  }

  return (
    <div>
      <div
        className="rounded-lg border border-dashed border-bg-border p-4 min-h-[60px]"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }}
      />
      <button
        onClick={() => {
          const next = prompt("Edit HTML", props.html);
          if (next != null && onChange) onChange({ html: next });
        }}
        className="mt-2 text-xs text-fg-muted hover:text-fg"
      >
        Edit HTML
      </button>
    </div>
  );
}
