"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { MediaItem, SliderProps } from "@/types";
import { useSrcSets } from "./image-variants";
import { cleanFocus } from "@/lib/focus-point";
import { cn } from "@/lib/utils";
import { domId } from "@/lib/dom-id";
import { withPicture } from "@/lib/media-item";
import {
  MAX_SLIDES,
  SLIDER_RATIOS,
  neighbourSlide,
  sliderControls,
  slidePositionLabel,
  slidesToDraw,
} from "@/lib/slider-nav";
import { MediaPicker } from "@/components/editor/MediaPicker";
import { Editable } from "./Editable";

interface Props {
  props: SliderProps;
  onChange?: (next: SliderProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

const roundedClass = { none: "rounded-none", md: "rounded-md", xl: "rounded-xl" } as const;
const RATIOS = new Set<string>(SLIDER_RATIOS);

function Chevron({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "next" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
}

/**
 * Pictures one at a time, moved by links rather than by a script.
 *
 * The strip of pictures is a plain scrolling row that snaps to one picture at
 * a time, so a visitor can swipe it, drag a trackpad across it or focus it and
 * use the arrow keys, all without a line of code. The arrows and the dots are
 * links to a picture's fragment: following one is the only kind of scrolling
 * a page with no script can ask for, and it is what the downloaded site has,
 * because the export strips every script and forbids the rest.
 *
 * Every slide carries its own pair of arrows, pointing at its two neighbours.
 * One pair for the whole strip would need to know which picture is showing,
 * and nothing without a script knows that; a pair per slide scrolls into view
 * with the slide it belongs to, so the arrows on screen are always the right
 * ones.
 *
 * The canvas cancels every link, since following one there used to walk out of
 * the builder. So while editing, the arrows are buttons that scroll the strip
 * themselves — the same circles in the same places — and the dots stay links
 * whose click is handled here instead of followed. Preview is cancelled in the
 * same way and is handled the same way; see `moveTo`.
 */
export function Slider({ props, onChange, disabled, blockId }: Props) {
  const editing = !disabled && !!onChange;
  const trackRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const srcSets = useSrcSets();
  // The slide to bring into view once a picture added from the canvas has been
  // drawn. It cannot be scrolled to from the picker's callback: the new slide
  // does not exist until the page has rendered again.
  const pendingScroll = useRef<number | null>(null);

  const stored: MediaItem[] = Array.isArray(props.slides) ? props.slides : [];
  const drawn = slidesToDraw(stored, editing);
  const count = drawn.length;

  useEffect(() => {
    const track = trackRef.current;
    const target = pendingScroll.current;
    if (!track || target == null || count === 0) return;
    pendingScroll.current = null;
    track.scrollTo({ left: Math.min(target, count - 1) * track.clientWidth });
  }, [count]);

  /**
   * Bring one slide into view on the canvas. No `behavior` is passed, so the
   * strip's own `scroll-behavior` decides — smooth, unless the person has asked
   * their system for less motion, in which case the stylesheet has already
   * said so.
   */
  function goTo(position: number) {
    const track = trackRef.current;
    if (track) track.scrollTo({ left: position * track.clientWidth });
  }

  /**
   * A link to a slide, followed by hand only where it has been cancelled.
   *
   * Preview draws the published page inside the canvas, and the canvas
   * cancels every link on it, so there the arrows and dots of a slider that
   * works everywhere else did nothing at all. When something above has
   * cancelled the click, the strip is moved here instead; anywhere else —
   * the live page — the link is left to do what it does in the downloaded
   * site, where there is no script to lean on.
   */
  const moveTo = (position: number) => (e: MouseEvent) => {
    if (editing) e.preventDefault();
    if (e.nativeEvent.defaultPrevented) goTo(position);
  };

  function updateSlide(index: number, next: MediaItem) {
    if (!onChange) return;
    const slides = stored.slice();
    slides[index] = next;
    onChange({ ...props, slides });
  }

  const full = stored.length >= MAX_SLIDES;
  const ratio = RATIOS.has(props.ratio) ? props.ratio : "16/9";
  const aspectRatio = ratio.replace("/", " / ");
  const rounded = roundedClass[props.rounded] ?? roundedClass.xl;

  const picker = editing ? (
    <MediaPicker
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      onSelect={(url, picked) => {
        if (!full) {
          pendingScroll.current = stored.length;
          onChange?.({ ...props, slides: [...stored, withPicture(undefined, url, picked)] });
        }
        setPickerOpen(false);
      }}
    />
  ) : null;

  // Nothing to show. A visitor gets nothing at all rather than an empty frame;
  // the author gets a frame of the right shape that says what it needs.
  if (count === 0) {
    if (!editing) return null;
    return (
      <div className="relative">
        <div
          className={cn(
            "w-full border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-1 text-center px-6",
            rounded,
          )}
          style={{ aspectRatio }}
        >
          <span className="text-2xl text-slate-400 leading-none" aria-hidden="true">⇆</span>
          <span className="text-sm font-medium text-slate-500">No slides yet</span>
          <span className="text-xs text-slate-400">Add the pictures to show one at a time.</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:border-slate-400"
          >
            + Add slide
          </button>
        </div>
        {picker}
      </div>
    );
  }

  const { arrows, dots, arrowsFocusable } = sliderControls(count, props.showArrows, props.showDots);
  // With dots drawn, the arrows are for the pointer: out of the Tab order and
  // out of what a screen reader lists. See `sliderControls` for why.
  const arrowAccess = arrowsFocusable ? {} : ({ tabIndex: -1, "aria-hidden": true } as const);
  const anchorOf = (position: number) => domId(blockId, "slide", position);

  return (
    <div className="nvx-slider relative" data-dots={dots ? "" : undefined}>
      <div
        ref={trackRef}
        className={cn("nvx-slider-track", rounded)}
        role="region"
        aria-roledescription="carousel"
        aria-label="Slideshow"
        // Focusable so the arrow keys scroll it: a strip that only moves under
        // a finger or a trackpad is a strip a keyboard cannot reach.
        tabIndex={0}
      >
        {drawn.map(({ slide, index }, position) => {
          const previous = neighbourSlide(position, count, -1);
          const next = neighbourSlide(position, count, 1);
          return (
            <div
              key={index}
              className="nvx-slider-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={slidePositionLabel(position, count)}
              style={{ aspectRatio }}
            >
              {/*
                What the arrows and dots link to. It is not the slide itself,
                because following a link to the slide also scrolls the page so
                the slide's top edge meets the top of the window, every time.
                `scroll-margin` would be the usual way to soften that, and
                Chromium ignores it here: it keeps the margin for the strip,
                which cannot scroll up and down, and drops it before it reaches
                the page. So the target is a line drawn above the slide
                instead, as far above it as centres the slider in the window —
                see `.nvx-slider-anchor` in globals.css.
              */}
              <span id={anchorOf(position)} className="nvx-slider-anchor" />
              <figure className="nvx-slider-figure">
                {slide.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slide.src}
                    srcSet={srcSets[slide.src]}
                    // A slide is as wide as the block, which is at most the page.
                    sizes={srcSets[slide.src] ? "(max-width: 72rem) 100vw, 72rem" : undefined}
                    alt={slide.alt || ""}
                    // Only a ratio here — the slide's shape decides the size —
                    // but it is the picture's own, so the browser can decode it
                    // at the right proportions before the bytes are in.
                    width={slide.naturalWidth || undefined}
                    height={slide.naturalHeight || undefined}
                    // The first picture is the one a visitor sees; the rest
                    // wait until the strip comes near them.
                    loading={position === 0 ? undefined : "lazy"}
                    decoding="async"
                    style={slide.focus ? { objectPosition: cleanFocus(slide.focus) } : undefined}
                    className="nvx-slider-picture"
                  />
                ) : (
                  <div className="nvx-slider-missing">No picture — choose one for this slide in the panel.</div>
                )}
                {slide.caption || editing ? (
                  <figcaption className={cn("nvx-slider-caption", !slide.caption && "nvx-slider-caption-empty")}>
                    <Editable
                      as="span"
                      disabled={!editing}
                      value={slide.caption ?? ""}
                      onChange={(caption) => updateSlide(index, { ...slide, caption })}
                      placeholder="Add a caption"
                    />
                  </figcaption>
                ) : null}
              </figure>
              {arrows ? (
                editing ? (
                  <>
                    <button type="button" className="nvx-slider-arrow nvx-slider-previous" aria-label="Previous slide" {...arrowAccess} onClick={() => goTo(previous)}>
                      <Chevron direction="previous" />
                    </button>
                    <button type="button" className="nvx-slider-arrow nvx-slider-next" aria-label="Next slide" {...arrowAccess} onClick={() => goTo(next)}>
                      <Chevron direction="next" />
                    </button>
                  </>
                ) : (
                  <>
                    <a className="nvx-slider-arrow nvx-slider-previous" href={`#${anchorOf(previous)}`} aria-label="Previous slide" {...arrowAccess} onClick={moveTo(previous)}>
                      <Chevron direction="previous" />
                    </a>
                    <a className="nvx-slider-arrow nvx-slider-next" href={`#${anchorOf(next)}`} aria-label="Next slide" {...arrowAccess} onClick={moveTo(next)}>
                      <Chevron direction="next" />
                    </a>
                  </>
                )
              ) : null}
            </div>
          );
        })}
      </div>
      {dots ? (
        /*
          Links on the canvas as well as on the page, unlike the arrows, so
          the two are drawn from the same markup. The canvas cancels a
          link's navigation, and `moveTo` scrolls the strip instead.
        */
        <ul className="nvx-slider-dots" aria-label="Choose a slide">
          {drawn.map(({ index }, position) => (
            <li key={index}>
              <a
                className="nvx-slider-dot"
                href={`#${anchorOf(position)}`}
                aria-label={`Go to slide ${position + 1}`}
                onClick={moveTo(position)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {editing && !full ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="nvx-block-chrome absolute left-2 top-2 z-10 rounded-md bg-bg-card/95 border border-bg-border px-2 py-1 text-xs text-fg-muted hover:text-fg shadow-lg"
        >
          + Add slide
        </button>
      ) : null}
      {picker}
    </div>
  );
}
