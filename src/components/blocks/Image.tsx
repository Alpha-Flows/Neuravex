"use client";
import { useState } from "react";
import { ImageProps } from "@/types";
import { cn } from "@/lib/utils";
import { MediaPicker } from "@/components/editor/MediaPicker";

interface Props {
  props: ImageProps;
  onChange?: (next: ImageProps) => void;
  disabled?: boolean;
}

const roundedClass = { none: "rounded-none", md: "rounded-md", xl: "rounded-xl", full: "rounded-3xl" } as const;
const widthClass = { small: "max-w-sm", medium: "max-w-xl", large: "max-w-3xl", full: "max-w-full" } as const;

export function Image({ props, onChange, disabled }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <figure className={cn("mx-auto", widthClass[props.width])}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={props.src || "https://via.placeholder.com/1200x600?text=Image"}
        alt={props.alt || ""}
        className={cn("w-full h-auto block", roundedClass[props.rounded], !disabled && "cursor-pointer hover:opacity-95")}
      />
      {!disabled && onChange ? (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => setPickerOpen(true)} className="text-xs text-fg-muted hover:text-fg underline">Upload image</button>
          <button onClick={() => { const next = prompt("Or paste an image URL", props.src); if (next != null) onChange({ ...props, src: next }); }} className="text-xs text-fg-muted hover:text-fg underline">Use URL</button>
        </div>
      ) : null}
      {props.caption ? (
        <figcaption className="text-sm text-slate-500 mt-2 text-center">{props.caption}</figcaption>
      ) : null}
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { onChange?.({ ...props, src: url }); setPickerOpen(false); }} />
    </figure>
  );
}
