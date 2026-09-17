"use client";
import { useState } from "react";
import { ImageProps } from "@/types";
import { cn } from "@/lib/utils";
import { MediaPicker } from "@/components/editor/MediaPicker";
import { InlineEdit } from "@/components/ui/InlineEdit";

interface Props {
  props: ImageProps;
  onChange?: (next: ImageProps) => void;
  disabled?: boolean;
}

const roundedClass = { none: "rounded-none", md: "rounded-md", xl: "rounded-xl", full: "rounded-3xl" } as const;

/**
 * Shown when a block has no picture yet. It used to be a via.placeholder.com
 * URL — a request to a third party to draw a grey rectangle, which shows as a
 * broken image the moment that service is unreachable. This one is the file
 * itself, so it always draws.
 */
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600">' +
      '<rect width="1200" height="600" fill="#e2e8f0"/>' +
      '<g fill="none" stroke="#94a3b8" stroke-width="8">' +
      '<rect x="480" y="222" width="240" height="168" rx="12"/>' +
      '<path d="M480 342l72-60 60 48 48-36 60 48"/>' +
      "</g>" +
      '<circle cx="556" cy="272" r="18" fill="#94a3b8"/>' +
      '<text x="600" y="446" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#64748b">No image yet</text>' +
      "</svg>",
  );
const widthClass = { small: "max-w-sm", medium: "max-w-xl", large: "max-w-3xl", full: "max-w-full" } as const;

export function Image({ props, onChange, disabled }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);

  return (
    <figure className={cn("mx-auto", widthClass[props.width])}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={props.src || PLACEHOLDER}
        alt={props.alt || ""}
        className={cn("w-full h-auto block", roundedClass[props.rounded], !disabled && "cursor-pointer hover:opacity-95")}
      />
      {!disabled && onChange ? (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => setPickerOpen(true)} className="text-xs text-fg-muted hover:text-fg underline">Upload image</button>
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setEditingUrl(true); }} className="text-xs text-fg-muted hover:text-fg underline">Use URL</button>
            {editingUrl ? (
              <InlineEdit
                label="Image URL"
                value={props.src}
                placeholder="https://example.com/photo.jpg"
                hint="An address on the web. A picture from your library travels with the site; one from the web needs a connection."
                onSave={(src) => { onChange({ ...props, src }); setEditingUrl(false); }}
                onCancel={() => setEditingUrl(false)}
                className="left-0 top-full"
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {props.caption ? (
        <figcaption className="text-sm text-slate-500 mt-2 text-center">{props.caption}</figcaption>
      ) : null}
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { onChange?.({ ...props, src: url }); setPickerOpen(false); }} />
    </figure>
  );
}
