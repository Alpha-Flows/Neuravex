"use client";
import { VideoProps } from "@/types";

interface Props {
  props: VideoProps;
  onChange?: (next: VideoProps) => void;
  disabled?: boolean;
}

export function Video({ props, disabled }: Props) {
  const ratio = (props.ratio || "16/9").replace("/", " / ");

  // A video block with nothing in it. On a published page it draws nothing at
  // all — a black box with dead controls is worse than an absent one — and in
  // the editor it says what it needs.
  if (!props.src) {
    if (disabled) return null;
    return (
      <div className="mx-auto max-w-4xl">
        <div
          className="w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-1 text-center px-6"
          style={{ aspectRatio: ratio }}
        >
          <span className="text-2xl text-slate-400 leading-none">▶</span>
          <span className="text-sm font-medium text-slate-500">No video yet</span>
          <span className="text-xs text-slate-400">Paste a video file address into &ldquo;Video URL&rdquo; in the panel on the right.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: ratio }}>
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
