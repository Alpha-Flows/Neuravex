"use client";
import { useState } from "react";
import { AudioLines } from "lucide-react";
import type { AudioProps } from "@/types";
import { Editable } from "./Editable";
import { MediaPicker } from "@/components/editor/MediaPicker";
import { TOKEN } from "@/lib/site-theme";
import { domId } from "@/lib/dom-id";
import { cn } from "@/lib/utils";
import { hasText, shownFields, type AudioField } from "@/lib/audio-fields";

interface Props {
  props: AudioProps;
  onChange?: (next: AudioProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

/**
 * What an emptied field stores: nothing.
 *
 * A browser leaves a `<br>` behind in a contentEditable that has been
 * backspaced clear, and that used to be saved as the title — the block drew
 * no title, rightly, and the panel's Title field read "<br />".
 */
function wordsOrNothing(html: string): string {
  return hasText(html) ? html : "";
}

/**
 * A sound file with a player: an episode, a track, a recorded message.
 *
 * Neuravex accepted MP3, WAV and OGG uploads and shipped a Podcast template,
 * and nothing in it could play a sound — the nearest thing was a Custom HTML
 * block, whose sanitiser keeps no `<audio>` element. The player here is the
 * browser's own `<audio controls>`, because it is the one player that works
 * in the downloaded site, which carries no script at all: play, pause,
 * seeking, volume and the keyboard all come with the element, and a
 * hand-drawn player would have needed JavaScript for every one of them.
 *
 * `preload="metadata"` fetches the file's header and no more, so the length
 * shows beside the play button without a visitor downloading an hour of
 * audio they may never play.
 *
 * The card takes its border and fill from `currentColor`, not from a palette
 * of its own, so it reads on a white page and inside a near-black section
 * alike; the player itself is the browser's and draws its own background.
 */
export function AudioBlock({ props, onChange, disabled, blockId }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  /** The field the caret is in, which stays drawn however empty it gets. */
  const [focused, setFocused] = useState<AudioField | null>(null);
  const src = (props.src ?? "").trim();

  // As the video block does: on a published page an empty player is a bar of
  // controls that do nothing, which is worse than no block at all.
  if (!src && disabled) return null;

  const editing = !disabled && !!onChange;
  const titleId = domId(blockId, "audio-title");
  // Only what has words in it, plus the field the caret is in — see
  // `audio-fields.ts` for the block this used to delete.
  const hasTitle = hasText(props.title);
  const shown = shownFields(props, focused);
  const showTitle = shown.title;
  const showDescription = shown.description;

  // Reported from the wrapper rather than from `Editable`, whose own focus
  // state is private to it. Capture, because focus and blur do not bubble.
  const track = (field: AudioField) =>
    editing
      ? {
          onFocusCapture: () => setFocused(field),
          onBlurCapture: () => setFocused((current) => (current === field ? null : current)),
        }
      : {};

  const openPicker = () => setPickerOpen(true);

  return (
    // `relative` (in globals.css) so the editor's own control can be placed
    // over the card instead of taking a line the published page does not
    // have.
    <figure className="nvx-audio" style={{ borderRadius: TOKEN.radius("0.75rem") }}>
      {showTitle || showDescription ? (
        <figcaption className="nvx-audio-head">
          <span
            aria-hidden="true"
            className="nvx-audio-mark"
            style={{ background: TOKEN.accent, color: TOKEN.accentContrast }}
          >
            <AudioLines size={18} strokeWidth={2} />
          </span>
          <span className="nvx-audio-text">
            {showTitle ? (
              <span id={titleId} className="nvx-audio-title" {...track("title")}>
                <Editable
                  as="span"
                  disabled={disabled}
                  value={props.title}
                  onChange={(title) => onChange?.({ ...props, title: wordsOrNothing(title) })}
                  placeholder="Title — what is playing"
                />
              </span>
            ) : null}
            {showDescription ? (
              <span className="nvx-audio-description" {...track("description")}>
                <Editable
                  as="span"
                  disabled={disabled}
                  value={props.description}
                  onChange={(description) => onChange?.({ ...props, description: wordsOrNothing(description) })}
                  placeholder="A line about it"
                  multiline
                />
              </span>
            ) : null}
          </span>
        </figcaption>
      ) : null}

      {src ? (
        <audio
          controls
          preload="metadata"
          src={src}
          aria-labelledby={hasTitle ? titleId : undefined}
          className="nvx-audio-player"
        >
          {/* Only for a browser with no player at all; every current one has one. */}
          <a href={src}>Download the recording</a>
        </audio>
      ) : editing ? (
        // Editor only — the published page returned above. The same height as
        // the player that replaces it, so choosing a file moves nothing; and
        // a button, because it says "choose a sound file" and should do it.
        <button type="button" onClick={openPicker} className="nvx-audio-empty">
          No audio yet — choose a sound file
        </button>
      ) : (
        <div className="nvx-audio-empty">No audio yet</div>
      )}

      {editing ? (
        <>
          <button
            type="button"
            onClick={openPicker}
            className={cn(
              "nvx-block-chrome absolute z-10 rounded-md border border-bg-border bg-bg-card/95 px-2 py-1 text-xs text-fg-muted shadow-lg hover:text-fg whitespace-nowrap",
              // Beside the title, level with the mark, when there is a title
              // row to sit in. Hung under the card it landed where the next
              // block's toolbar appears and over that block's first line.
              // With no title row the top of the card is the player, whose
              // own buttons it would cover, so then it hangs underneath.
              showTitle || showDescription ? "right-3 top-[1.375rem]" : "right-0 top-full mt-1",
            )}
          >
            {src ? "Change audio" : "Choose audio"}
          </button>
          <MediaPicker
            open={pickerOpen}
            kind="audio"
            onClose={() => setPickerOpen(false)}
            onSelect={(url) => {
              onChange?.({ ...props, src: url });
              setPickerOpen(false);
            }}
          />
        </>
      ) : null}
    </figure>
  );
}
