"use client";
import { useId, useRef } from "react";
import type { VideoProps } from "@/types";
import { Input, Label } from "@/components/ui/Input";
import { Field, SegBtns, type BlockPanelProps } from "../inspector-fields";
import {
  VIDEO_PROVIDER_NAME,
  looksLikeVideoFile,
  videoEmbed,
  videoEmbedHost,
  videoFileHost,
  videoSiteOf,
  videoTitle,
} from "@/lib/video-embed";

const RATIOS = ["16/9", "4/3", "1/1", "9/16"] as const;

/**
 * The video block's panel.
 *
 * It used to be three bare fields, and "Video URL" gave no hint that it meant
 * a file: a YouTube link went in, a black box with dead controls came out, and
 * nothing said why. The block reads YouTube and Vimeo links now, so the panel
 * says what it made of the one it was given — which player, from which
 * server — and that the server is one the privacy notice will name, because
 * that is the part an operator otherwise finds out from a letter.
 */
export function VideoPanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as VideoProps;
  const set = <K extends keyof VideoProps>(key: K, value: VideoProps[K]) =>
    onChange({ ...block, props: { ...block.props, [key]: value } });

  const srcId = useId();
  const srcHint = useId();
  const posterId = useId();
  const posterHint = useId();
  const titleId = useId();
  const titleHint = useId();
  const ratioRow = useRef<HTMLDivElement>(null);

  const embed = videoEmbed(p.src);
  const site = embed ? null : videoSiteOf(p.src);
  const fileHost = embed || site ? null : videoFileHost(p.src);
  const isFile = !embed && !site && looksLikeVideoFile(p.src);
  const fallbackTitle = videoTitle("", embed);

  return (
    <>
      <div>
        <Label htmlFor={srcId}>Video URL</Label>
        <Input
          id={srcId}
          value={p.src}
          inputMode="url"
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-describedby={srcHint}
          onChange={(e) => set("src", e.target.value)}
        />
        <div id={srcHint} className="mt-1 space-y-1 text-[11px] text-fg-subtle">
          <p>A YouTube or Vimeo link, or the address of a video file.</p>
          {embed ? (
            <p className="text-fg-muted">
              {VIDEO_PROVIDER_NAME[embed.provider]} video — played from{" "}
              {embed.provider === "youtube" ? "youtube-nocookie.com" : `${videoEmbedHost(embed)} with “do not track” set`}, which
              the privacy notice will name.
            </p>
          ) : site ? (
            <p className="text-amber-400">
              That is a {VIDEO_PROVIDER_NAME[site]} address, but there is no video in it that can be played here. Use the
              link from the video&apos;s Share button — until then the published page leaves this block out.
            </p>
          ) : !p.src.trim() ? null : !isFile ? (
            <p className="text-amber-400">
              This does not look like a video file, so it may not play. Use a YouTube or Vimeo link, or the address of a
              file ending .mp4 or .webm.
              {fileHost ? ` It is loaded from ${fileHost}, which the privacy notice will name.` : ""}
            </p>
          ) : fileHost ? (
            <p className="text-fg-muted">A video file from {fileHost}, which the privacy notice will name.</p>
          ) : (
            <p className="text-fg-muted">A video file that travels with this site.</p>
          )}
        </div>
      </div>

      {embed?.upright && p.ratio !== "9/16" ? (
        <div className="rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[11px] text-fg-muted">
          <p>A Short is filmed upright. In this shape it plays as a narrow strip between two black bars.</p>
          <button
            onClick={() => {
              set("ratio", "9/16");
              // This button goes away the moment it has done its job, and
              // focus went with it, to the document itself: a screen reader
              // announced nothing, and where the next Tab landed was up to
              // the browser. The pressed 9 / 16 button below is where the
              // choice now shows, so focus goes there once it has been drawn.
              requestAnimationFrame(() =>
                ratioRow.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(),
              );
            }}
            className="mt-1 text-fg underline hover:text-brand"
          >
            Use the upright 9 / 16 shape
          </button>
        </div>
      ) : null}

      <div>
        <Label htmlFor={titleId}>Title for screen readers</Label>
        <Input
          id={titleId}
          value={p.title ?? ""}
          maxLength={300}
          placeholder={fallbackTitle ?? "What the video is"}
          aria-describedby={titleHint}
          onChange={(e) => set("title", e.target.value)}
        />
        <p id={titleHint} className="text-[11px] text-fg-subtle mt-1">
          Read out to say what the video is — “Our workshop in two minutes”.
          {fallbackTitle ? ` Left empty, it is called “${fallbackTitle}”.` : " Left empty, the player has no name of its own."}
        </p>
      </div>

      <div>
        <Label htmlFor={posterId}>Poster image URL</Label>
        <Input
          id={posterId}
          value={p.poster}
          inputMode="url"
          spellCheck={false}
          aria-describedby={posterHint}
          onChange={(e) => set("poster", e.target.value)}
        />
        <p id={posterHint} className="text-[11px] text-fg-subtle mt-1">
          {embed
            ? `Not used: only a video file shows a poster. ${VIDEO_PROVIDER_NAME[embed.provider]} draws its own preview picture.`
            : "The picture shown before the video starts. Only a video file uses it — YouTube and Vimeo draw their own."}
        </p>
      </div>

      <Field label="Aspect ratio">
        <div ref={ratioRow}>
          <SegBtns value={p.ratio} options={RATIOS} onChange={(v) => set("ratio", v)} />
        </div>
      </Field>
    </>
  );
}
