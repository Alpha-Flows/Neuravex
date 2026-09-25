"use client";
import { VideoProps } from "@/types";
import { cn } from "@/lib/utils";
import { VIDEO_FRAME, VIDEO_PROVIDER_NAME, videoEmbed, videoSiteOf, videoTitle } from "@/lib/video-embed";

interface Props {
  props: VideoProps;
  onChange?: (next: VideoProps) => void;
  disabled?: boolean;
}

export function Video({ props, disabled }: Props) {
  const ratio = (props.ratio || "16/9").replace("/", " / ");
  // An upright video is nearly twice as tall as it is wide. At the 896px a
  // landscape one takes, 9:16 came out about 1600px tall — taller than any
  // screen, so nobody could see the whole of a Short at once. It takes
  // roughly a phone's width instead.
  const width = props.ratio === "9/16" ? "max-w-sm" : "max-w-4xl";
  const embed = props.src ? videoEmbed(props.src) : null;
  // A YouTube or Vimeo address with no video in it — a channel, a search, a
  // playlist. Handed to a `<video>` element like a file, it drew dead
  // controls over a black box and still sent every visitor's browser to
  // YouTube for a page no player can read, so it is treated as no video.
  const noVideoAt = props.src && !embed ? videoSiteOf(props.src) : null;

  // A video block with nothing in it. On a published page it draws nothing at
  // all — a black box with dead controls is worse than an absent one — and in
  // the editor it says what it needs.
  if (!props.src || noVideoAt) {
    if (disabled) return null;
    return (
      <div className={cn("mx-auto", width)}>
        <div
          className="w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-1 text-center px-6"
          style={{ aspectRatio: ratio }}
        >
          <span className="text-2xl text-slate-400 leading-none">▶</span>
          {noVideoAt ? (
            <>
              <span className="text-sm font-medium text-slate-500">
                No video in this {VIDEO_PROVIDER_NAME[noVideoAt]} address
              </span>
              <span className="text-xs text-slate-400">
                Use the link from the video&apos;s Share button. Until then the published page leaves this block out.
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-slate-500">No video yet</span>
              <span className="text-xs text-slate-400">
                Paste a YouTube or Vimeo link, or a video file&apos;s address, into &ldquo;Video URL&rdquo; in the panel
                on the right.
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  const title = videoTitle(props.title, embed);

  return (
    <div className={cn("mx-auto", width)}>
      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: ratio }}>
        {embed ? (
          <>
            {/*
              The same frame the sanitiser would have kept had the author
              written it into a Custom HTML block — see VIDEO_FRAME — plus the
              older `allowfullscreen` for a browser that predates the
              `fullscreen` token in `allow`. Chrome notes in the console that
              the token takes precedence, which is the intent. On the canvas
              the frame is left out of the tab order: the player cannot be
              used there (below), so tabbing into it only lost the author's
              place in the editor.
            */}
            <iframe
              src={embed.embedUrl}
              title={title}
              sandbox={VIDEO_FRAME.sandbox}
              allow={VIDEO_FRAME.allow}
              referrerPolicy={VIDEO_FRAME.referrerPolicy}
              loading={VIDEO_FRAME.loading}
              allowFullScreen
              tabIndex={disabled ? undefined : -1}
              className="absolute inset-0 w-full h-full border-0"
            />
            {!disabled ? (
              <>
                {/*
                  A frame is another document, and a click inside it is that
                  document's click: the canvas never heard about it, so a
                  YouTube block could not be selected by clicking the player,
                  which is nearly all of it. This transparent layer takes the
                  click for the canvas instead. It is a plain layer rather
                  than `nvx-block-chrome`, which lets the pointer through
                  whenever the block is neither hovered nor selected: this
                  one has to catch it every time, and being transparent it
                  changes nothing the author sees. Preview draws the page
                  without it, and the player works there.
                */}
                <div aria-hidden="true" className="absolute inset-0" />
                <span className="nvx-block-chrome absolute left-2 bottom-2 z-10 max-w-[calc(100%-1rem)] rounded-md bg-bg-card/95 border border-bg-border px-2 py-1 text-xs text-fg-muted shadow-lg">
                  {VIDEO_PROVIDER_NAME[embed.provider]} video — plays in preview and on the published page
                </span>
              </>
            ) : null}
          </>
        ) : (
          <video
            src={props.src}
            poster={props.poster || undefined}
            aria-label={title}
            controls
            className="absolute inset-0 w-full h-full"
          />
        )}
      </div>
    </div>
  );
}
