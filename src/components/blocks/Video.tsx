"use client";
import { VideoProps } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  props: VideoProps;
  onChange?: (next: VideoProps) => void;
  disabled?: boolean;
}

export function Video({ props, disabled }: Props) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: props.ratio.replace("/", " / ") }}>
        <video
          src={props.src}
          poster={props.poster || undefined}
          controls
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}
