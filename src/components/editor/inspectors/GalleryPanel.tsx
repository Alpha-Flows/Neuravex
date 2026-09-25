"use client";
import { useState } from "react";
import type { GalleryProps, MediaItem } from "@/types";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "../MediaPicker";
import { withPicture } from "@/lib/media-item";
import { GALLERY_MAX_PICTURES } from "@/lib/gallery-lightbox";
import { editedText, hasFormatting, plainText } from "@/lib/inline-text";
import { Field, ListEditor, SegBtns, Select, Toggle, type BlockPanelProps } from "../inspector-fields";

const COLUMNS = ["2", "3", "4"] as const;

const FORMATTING_NOTE = "Formatted on the page. Changing the words here keeps them and drops the formatting.";

/**
 * The gallery's settings, and its pictures one row each.
 *
 * One picture library serves both ways a picture arrives — "Add picture" at
 * the foot of the list and "Change" on a row — so which of the two opened it
 * is remembered: `"new"` appends, a number replaces that row. Both go through
 * `withPicture`, the image block's rule for a chosen picture, so a gallery
 * tile takes the file's size and the library's description exactly as a
 * single image does, and never overwrites words somebody typed.
 */
export function GalleryPanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as GalleryProps;
  const images: MediaItem[] = Array.isArray(p.images) ? p.images : [];
  const [picking, setPicking] = useState<number | "new" | null>(null);

  function set<K extends keyof GalleryProps>(key: K, value: GalleryProps[K]) {
    onChange({ ...block, props: { ...p, [key]: value } });
  }

  return (
    <>
      <Field label="Pictures">
        <ListEditor<MediaItem>
          items={images}
          onChange={(next) => set("images", next)}
          onAdd={() => setPicking("new")}
          addLabel="Add picture"
          itemLabel={(_, i) => `Picture ${i + 1}`}
          max={GALLERY_MAX_PICTURES}
          renderItem={(item, update, i) => (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-14 h-14 shrink-0 rounded overflow-hidden border border-bg-border bg-bg-card flex items-center justify-center">
                  {item.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.src}
                      alt=""
                      // Each thumbnail is the full-size file, since there is no
                      // other. Selecting a sixty-picture gallery fetched all
                      // sixty the moment the panel opened; lazily, only the rows
                      // scrolled to are.
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-fg-subtle text-center leading-tight px-1">No picture</span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setPicking(i)} aria-label={`Change picture ${i + 1}`}>
                  Change
                </Button>
              </div>
              <label className="block text-[11px] text-fg-subtle">
                Alt text
                <Input
                  value={item.alt ?? ""}
                  placeholder="What the picture shows"
                  // Typed words are the author's own from here on, so choosing
                  // another picture for this tile keeps them.
                  onChange={(e) => update({ ...item, alt: e.target.value, altFromLibrary: false })}
                  className="mt-1 h-8 text-sm"
                />
              </label>
              <label className="block text-[11px] text-fg-subtle">
                Caption
                <Input
                  // The caption is stored as inline HTML, because it is also
                  // typed on the canvas and can be bolded there. Shown raw,
                  // "Fish & chips" came back as "Fish &amp; chips", and typed
                  // text was parsed as markup — "Rooms 1<a and 2" was stored
                  // as "Rooms 1". The box shows and takes plain words.
                  value={plainText(item.caption)}
                  placeholder="Optional, shown under the picture"
                  onChange={(e) => update({ ...item, caption: editedText(item.caption ?? "", e.target.value) })}
                  className="mt-1 h-8 text-sm"
                />
              </label>
              {hasFormatting(item.caption ?? "") ? <p className="text-[11px] text-fg-subtle">{FORMATTING_NOTE}</p> : null}
            </div>
          )}
        />
      </Field>

      <Field label="Columns">
        <SegBtns
          value={String(p.columns) as (typeof COLUMNS)[number]}
          options={COLUMNS}
          onChange={(v) => set("columns", Number(v) as GalleryProps["columns"])}
          nameFor={(v) => `${v} columns`}
        />
        <p className="text-[11px] text-fg-subtle mt-1">Fewer where the gallery is narrow — in a column, or on a phone.</p>
      </Field>

      <Field label="Gap (px)">
        <Input
          type="number"
          min={0}
          max={64}
          value={p.gap}
          onChange={(e) => {
            const n = Number(e.target.value);
            set("gap", Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 64) : 0);
          }}
        />
      </Field>

      <Field label="Shape">
        <Select
          value={p.aspect}
          onChange={(v) => set("aspect", v as GalleryProps["aspect"])}
          options={[
            { value: "square", label: "Square" },
            { value: "landscape", label: "Landscape (4:3)" },
            { value: "portrait", label: "Portrait (3:4)" },
            { value: "natural", label: "Each picture's own shape" },
          ]}
        />
        {p.aspect === "natural" ? (
          <p className="text-[11px] text-fg-subtle mt-1">
            Fills each column top to bottom, so the pictures read down the first column and then the next — not along
            the rows.
          </p>
        ) : null}
      </Field>

      <Field label="Rounded corners">
        <Select
          value={p.rounded}
          onChange={(v) => set("rounded", v as GalleryProps["rounded"])}
          options={[
            { value: "none", label: "None" },
            { value: "md", label: "Slight" },
            { value: "xl", label: "Rounded" },
          ]}
        />
      </Field>

      <Toggle
        label="Open a picture large when it is clicked"
        checked={p.lightbox}
        onChange={(v) => set("lightbox", v)}
        hint="Works in the downloaded site too: it is plain HTML and CSS, with no script to go missing."
      />

      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        onSelect={(url, picked) => {
          if (picking === "new") {
            if (images.length < GALLERY_MAX_PICTURES) set("images", [...images, withPicture(undefined, url, picked)]);
          } else if (picking !== null) {
            set("images", images.map((item, k) => (k === picking ? withPicture(item, url, picked) : item)));
          }
          setPicking(null);
        }}
      />
    </>
  );
}
