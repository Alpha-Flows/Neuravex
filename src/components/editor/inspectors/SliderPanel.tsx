"use client";
import { useState } from "react";
import type { MediaItem, SliderProps } from "@/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "../MediaPicker";
import { Field, ListEditor, SegBtns, Select, Toggle, type BlockPanelProps } from "../inspector-fields";
import { withPicture } from "@/lib/media-item";
import { MAX_SLIDES, SLIDE_ALT_MAX, SLIDER_RATIOS, SLIDER_RATIO_NAME } from "@/lib/slider-nav";
import { editedText, hasFormatting, plainText } from "@/lib/inline-text";

const FORMATTING_NOTE = "Formatted on the page. Changing the words here keeps them and drops the formatting.";

/**
 * The slider's panel.
 *
 * The slides are a list like any other — reordered, removed and described a
 * row at a time — except that a slide is a picture first, so adding one opens
 * the picture library rather than putting an empty row on the end that would
 * show a visitor nothing. Choosing a picture goes through `withPicture`, the
 * image block's rule: its size is taken, and so is the library's description,
 * unless somebody has already written their own.
 */
export function SliderPanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as SliderProps;
  const slides: MediaItem[] = Array.isArray(p.slides) ? p.slides : [];
  const set = <K extends keyof SliderProps>(key: K, value: SliderProps[K]) =>
    onChange({ ...block, props: { ...block.props, [key]: value } });

  // Which slide the library is choosing a picture for; "new" adds one.
  const [picking, setPicking] = useState<number | "new" | null>(null);

  return (
    <>
      <Field label="Slides">
        <ListEditor<MediaItem>
          items={slides}
          onChange={(next) => set("slides", next)}
          itemLabel={(_, i) => `Slide ${i + 1}`}
          addLabel="Add slide"
          onAdd={() => setPicking("new")}
          max={MAX_SLIDES}
          renderItem={(slide, update, i) => (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-20 h-12 shrink-0 rounded overflow-hidden border border-bg-border bg-bg-card flex items-center justify-center">
                  {slide.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slide.src} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-fg-subtle">No picture</span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setPicking(i)} aria-label={`Change the picture on slide ${i + 1}`}>
                  Change
                </Button>
              </div>
              {/*
                Each field says what it is above it. With a placeholder alone,
                a filled-in row was two boxes of words with nothing to tell the
                description a screen reader reads from the caption everyone
                sees.
              */}
              <label className="block">
                <span className="block mb-1 text-[11px] text-fg-subtle">Alt text</span>
                <Input
                  value={slide.alt ?? ""}
                  placeholder="Describe the picture"
                  aria-label={`Alt text for slide ${i + 1}`}
                  // The validator keeps this many characters and cuts the
                  // rest; the box stops at the same place, so nothing typed
                  // here is lost on the next save without a word.
                  maxLength={SLIDE_ALT_MAX}
                  // Typed words are the author's own, so choosing another
                  // picture later keeps them rather than swapping in the
                  // library's.
                  onChange={(e) => update({ ...slide, alt: e.target.value, altFromLibrary: false })}
                />
              </label>
              <label className="block">
                <span className="block mb-1 text-[11px] text-fg-subtle">Caption</span>
                <Input
                  // The caption is stored as inline HTML, because it can be
                  // bolded or linked on the picture itself. Shown raw, the box
                  // read "Day <b>one</b>" and "Fish &amp; chips", and typed
                  // text was taken for markup. It shows and takes plain words,
                  // and a caption whose words are unchanged keeps its bold.
                  value={plainText(slide.caption)}
                  placeholder="Optional"
                  aria-label={`Caption for slide ${i + 1}`}
                  onChange={(e) => update({ ...slide, caption: editedText(slide.caption ?? "", e.target.value) })}
                />
              </label>
              {hasFormatting(slide.caption ?? "") ? <p className="text-[11px] text-fg-subtle">{FORMATTING_NOTE}</p> : null}
            </div>
          )}
        />
        {slides.length > 0 ? (
          <p className="mt-2 text-[11px] text-fg-subtle">
            The alt text is what a screen reader says instead of the picture. A caption is shown over the foot of the
            slide, and can be written on the picture itself too.
          </p>
        ) : null}
      </Field>

      <Field label="Shape">
        <SegBtns value={p.ratio} options={SLIDER_RATIOS} onChange={(v) => set("ratio", v)} nameFor={(v) => SLIDER_RATIO_NAME[v]} />
      </Field>

      <Field label="Rounded corners">
        <Select
          value={p.rounded}
          onChange={(v) => set("rounded", v as SliderProps["rounded"])}
          options={[
            { value: "none", label: "None" },
            { value: "md", label: "Slight" },
            { value: "xl", label: "Rounded" },
          ]}
        />
      </Field>

      <div className="space-y-2">
        <Toggle
          label="Arrows"
          checked={p.showArrows !== false}
          onChange={(v) => set("showArrows", v)}
          hint="Round buttons at either side of each picture. Each click is also a step in the visitor's Back button — without a script there is no way round that."
        />
        <Toggle
          label="Dots"
          checked={p.showDots !== false}
          onChange={(v) => set("showDots", v)}
          hint="A row beneath the pictures, one for each slide. Each click is a step in the Back button too."
        />
        {slides.length < 2 ? (
          <p className="text-[11px] text-fg-subtle">With one picture there is nothing to move to, so neither is shown.</p>
        ) : p.showArrows === false && p.showDots === false ? (
          <p className="text-[11px] text-amber-400">
            With neither, the pictures move only by swiping, a trackpad or the arrow keys — a plain mouse wheel
            cannot move them.
          </p>
        ) : null}
      </div>

      <MediaPicker
        open={picking != null}
        onClose={() => setPicking(null)}
        onSelect={(url, picked) => {
          if (picking === "new") {
            if (slides.length < MAX_SLIDES) set("slides", [...slides, withPicture(undefined, url, picked)]);
          } else if (picking != null && slides[picking]) {
            const next = slides.slice();
            next[picking] = withPicture(slides[picking], url, picked);
            set("slides", next);
          }
          setPicking(null);
        }}
      />
    </>
  );
}
