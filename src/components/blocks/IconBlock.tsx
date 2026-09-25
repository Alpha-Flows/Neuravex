"use client";
import { useState, type KeyboardEvent } from "react";
import type { IconProps } from "@/types";
import { Editable } from "./Editable";
import { cn } from "@/lib/utils";
import { cssColor } from "@/lib/css-value";
import { TOKEN } from "@/lib/site-theme";
import { iconLabel, resolveIconName } from "@/lib/icon-names";
import { ICON_SET } from "@/lib/icon-set";
import { isBlank } from "@/lib/inline-text";
import { wordsOrNothing } from "@/lib/icon-card";

interface Props {
  props: IconProps;
  onChange?: (next: IconProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

/**
 * How big each size draws, in pixels.
 *
 * The drawing and the shape around it are sized together, because one fixed
 * circle swamps a small icon and pinches a large one. The stroke thins a
 * little as the icon grows: lucide scales its two-pixel line with the
 * drawing, so a 56px icon at the default weight drew a line nearly five
 * pixels thick, heavier than any letter in the 16px text beside it.
 */
const SIZE = {
  sm: { icon: 20, pad: 8, stroke: 2, title: "text-base", text: "text-sm", gap: "mt-3" },
  md: { icon: 28, pad: 12, stroke: 2, title: "text-lg", text: "text-base", gap: "mt-4" },
  // The two large titles match the heading block's level 4 and level 3, so a
  // row of cards sits under a template's section heading at the size the
  // templates' own feature rows use rather than a step below it.
  lg: { icon: 40, pad: 16, stroke: 1.75, title: "text-xl md:text-2xl", text: "text-base", gap: "mt-5" },
  xl: { icon: 56, pad: 20, stroke: 1.5, title: "text-2xl md:text-3xl", text: "text-lg", gap: "mt-6" },
} as const;

type Field = "title" | "text";

/**
 * An icon, on its own or as the head of a small feature card.
 *
 * The drawing is lucide's, rendered here as inline SVG rather than fetched,
 * so it is part of the page's markup: the published page, the preview and a
 * downloaded site opened from disk all have it with no network and no
 * script. Its stroke is `currentColor`, and the colour is set on the shape
 * around it, so an empty colour follows the site's accent and a section's
 * dark background never needs a variant of its own.
 *
 * A card's title and text inherit the colour of whatever they sit on — a
 * white page or a dark section — and the text is muted by opacity rather
 * than drawn in a grey that is only readable on one of the two.
 */
export function IconBlock({ props, onChange, disabled }: Props) {
  /**
   * The field being typed in, kept on the page while it is empty.
   *
   * A title or text is drawn only when it has words in it, because an
   * empty heading on the published page is a heading with no name (see
   * `wordsOrNothing` for what "empty" turned out to mean). On the
   * canvas that meant deleting a title to retype it took the element away
   * under the caret on the last Backspace, and the next keystroke went
   * nowhere. So a field stays while it has focus, and only an empty field
   * somebody has left goes.
   */
  const [editing, setEditing] = useState<Field | null>(null);

  // Looked up in the table rather than through a function returning the
  // component: the lint rule against components made during render cannot
  // see through a call, and a lookup it can see is a fixed import.
  const Drawing = ICON_SET[resolveIconName(props.icon)];
  const size = SIZE[props.size] ?? SIZE.md;
  const shaped = props.shape === "circle" || props.shape === "square";
  const box = size.icon + (shaped ? size.pad * 2 : 0);
  // A CSS-wide keyword in the colour field means "the text around it", which
  // is what `inherit` and `unset` do anyway. `initial` does not: it is the
  // browser's own text colour for the document's colour scheme, which on the
  // published page — dark, for the builder's sake — is white, and a lone
  // phone icon typed as `initial` was white on a white page.
  const own = cssColor(props.color);
  const colour = own && /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(own) ? "currentColor" : own ?? TOKEN.accent;

  const live = !disabled && !!onChange;
  const showTitle = !isBlank(props.title) || (live && editing === "title");
  const showText = !isBlank(props.text) || (live && editing === "text");
  // With words beside it the icon is decoration and the title says what it
  // means; on its own, the picture is the content and needs a name.
  const card = showTitle || showText;

  return (
    <div
      className="nvx-icon"
      // The mark and the words line up together; see the icon region of
      // globals.css, which travels with a downloaded site.
      data-align={props.align}
      onFocus={live ? (e) => setEditing(fieldOf(e.target)) : undefined}
      onBlur={live ? () => setEditing(null) : undefined}
      onKeyDown={live ? keepLineBreak : undefined}
    >
      <span
        className="nvx-icon-mark"
        data-shape={shaped ? props.shape : undefined}
        style={{
          width: box,
          height: box,
          color: colour,
          // A tint of the icon's own colour, so the shape follows the accent
          // too. `color-mix` with `transparent` rather than a fixed pale
          // colour, which is what keeps it a soft wash on a white page and a
          // faint glow in a dark section instead of a white disc on navy.
          //
          // Mixed from `currentColor`, which is the line above, rather than
          // from the colour written out again. The colour field accepts the
          // CSS keywords `inherit` and `unset`, which are fine as a `color`
          // and meaningless inside `color-mix` — the whole declaration was
          // thrown away and the circle vanished, leaving a bare icon.
          background: shaped ? "color-mix(in srgb, currentColor 14%, transparent)" : undefined,
          borderRadius: props.shape === "circle" ? "9999px" : props.shape === "square" ? TOKEN.radius("0.75rem") : undefined,
        }}
      >
        <Drawing
          size={size.icon}
          strokeWidth={size.stroke}
          {...(card ? { "aria-hidden": true } : { role: "img", "aria-label": iconLabel(props.icon) })}
        />
      </span>
      {showTitle ? (
        <Editable
          as="h3"
          disabled={disabled}
          value={props.title}
          onChange={(title) => onChange?.({ ...props, title: wordsOrNothing(title) })}
          placeholder="Title"
          className={cn("nvx-icon-title", size.title, size.gap, isBlank(props.title) && "nvx-icon-blank")}
        />
      ) : null}
      {showText ? (
        <Editable
          as="p"
          disabled={disabled}
          value={props.text}
          onChange={(text) => onChange?.({ ...props, text: wordsOrNothing(text) })}
          placeholder="A line or two about it"
          multiline
          className={cn("nvx-icon-text", size.text, showTitle ? "mt-1.5" : size.gap, isBlank(props.text) && "nvx-icon-blank")}
        />
      ) : null}
    </div>
  );
}

/**
 * Enter in a card's text starts a new line, as the accordion's answers do.
 *
 * Left to itself Chromium wraps the new line in a <div>, the inline-text
 * sanitiser keeps the words and drops the <div>, and "Line three" Enter
 * "Line four" was saved as "Line threeLine four". A line break is what the
 * sanitiser keeps and what the card's pre-wrap shows. The title needs
 * nothing: Enter there finishes editing, which `Editable` already does.
 */
function keepLineBreak(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
  if (!(e.target as HTMLElement).closest(".nvx-icon-text")) return;
  e.preventDefault();
  document.execCommand("insertLineBreak");
}

/** Which of the card's two fields an element belongs to, if either. */
function fieldOf(target: EventTarget): Field | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(".nvx-icon-title")) return "title";
  if (target.closest(".nvx-icon-text")) return "text";
  return null;
}
