"use client";
import { useState } from "react";
import type { GalleryProps, MediaItem } from "@/types";
import { cn } from "@/lib/utils";
import { domId } from "@/lib/dom-id";
import { withPicture } from "@/lib/media-item";
import { GALLERY_MAX_PICTURES, lightboxLinks, openLabel } from "@/lib/gallery-lightbox";
import { isBlank } from "@/lib/inline-text";
import { MediaPicker } from "@/components/editor/MediaPicker";
import { Editable } from "./Editable";

interface Props {
  props: GalleryProps;
  onChange?: (next: GalleryProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

const roundedClass = { none: "", md: "rounded-md", xl: "rounded-xl" } as const;

const noop = () => {};

/**
 * A grid of pictures, each of which opens large over the page when clicked.
 *
 * The obvious lightbox is a script that listens for the click, and the
 * downloaded site has no script — `static-export.ts` strips every one and
 * forbids the rest with `script-src 'none'` — so a scripted lightbox would
 * have worked on the builder's own copy of the page and been a grid of dead
 * pictures on the site the customer actually hosts. This one is anchors and a
 * `:target` rule instead. Each tile links to `#…-photo-N`; after the grid
 * there is one overlay per picture with that id, hidden until the address
 * names it; the overlay's arrows link to its neighbours and its close link
 * goes back to the tile. The browser does the rest, the same on the
 * published page as in the downloaded site. One thing it does that a script
 * would not: every picture opened, stepped to or closed is a new entry in the
 * browser's history, so Back walks back through the pictures before it
 * leaves the page. Nothing without a script can replace an entry instead of
 * adding one, and a lightbox that works in the download is worth that.
 *
 * The overlays open on the published page and in the download, and nowhere
 * in the builder. The canvas cancels every link it is clicked on, so on the
 * editor they would be sixty hidden copies of the pictures for nothing and
 * are not drawn at all. Preview is `disabled` like the published page and
 * draws them, but it cancels links too, and globals.css keeps an overlay
 * shut inside `.editor-mode` even when the builder's own address names one.
 *
 * The grid answers to its own width, not the window's: a three-across
 * gallery in one half of a Columns block is already narrow on a wide screen.
 * That is a container query on `.nvx-gallery-frame`, which is why the frame
 * is a separate element from the one the overlays hang off. A query
 * container is a containment boundary, and whether a `position: fixed` box
 * inside one is still fixed to the window has not always had the same answer
 * from one browser, or one draft of the specification, to the next. The
 * overlays are kept out of the gallery's own container so that question never
 * arises for it.
 */
export function Gallery({ props, onChange, disabled, blockId }: Props) {
  const [picking, setPicking] = useState(false);
  const editing = !disabled && !!onChange;
  const images: MediaItem[] = Array.isArray(props.images) ? props.images : [];

  // A picture whose address was refused on the way in — a `javascript:` src
  // comes back from the validator as "" — is a hole in the editor the author
  // can fill with "Change", and nothing at all on the page a visitor sees.
  const pictures = images
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => editing || !!image.src);

  const full = images.length >= GALLERY_MAX_PICTURES;
  const lightbox = props.lightbox && pictures.length > 0;
  const links = lightboxLinks(blockId, pictures.length);

  function addPicture(url: string, picked?: Parameters<typeof withPicture>[2]) {
    if (!onChange || full) return;
    onChange({ ...props, images: [...images, withPicture(undefined, url, picked)] });
  }

  function setCaption(index: number, caption: string) {
    onChange?.({ ...props, images: images.map((image, k) => (k === index ? { ...image, caption } : image)) });
  }

  const picker = editing ? (
    <MediaPicker
      open={picking}
      onClose={() => setPicking(false)}
      onSelect={(url, picked) => {
        addPicture(url, picked);
        setPicking(false);
      }}
    />
  ) : null;

  if (pictures.length === 0) {
    // Nothing to show a visitor, so nothing is drawn for one — not an empty
    // box with a gap under it. The author gets a place to start instead.
    if (!editing) return null;
    return (
      <div
        className="rounded-lg border-2 border-dashed px-6 py-10 text-center"
        style={{ borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}
      >
        <p className="text-sm" style={{ color: "color-mix(in srgb, currentColor 70%, transparent)" }}>
          This gallery has no pictures yet.
        </p>
        <button
          onClick={() => setPicking(true)}
          className="mt-3 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs text-fg shadow-sm hover:border-brand/60"
        >
          Add a picture
        </button>
        {picker}
      </div>
    );
  }

  return (
    <div id={domId(blockId)} className="nvx-gallery relative">
      <div className="nvx-gallery-frame">
        <ul
          className="nvx-gallery-grid"
          data-cols={String(props.columns)}
          data-aspect={props.aspect}
          style={{ ["--nvx-gallery-gap" as string]: `${props.gap}px` }}
        >
          {pictures.map(({ image, index }, k) => {
            const picture = image.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.src}
                alt={image.alt || ""}
                // The file's own size, as an image block gives it: with it the
                // browser holds each tile's space before the bytes arrive, and
                // a "natural" grid does not reshuffle as each picture lands.
                width={image.naturalWidth || undefined}
                height={image.naturalHeight || undefined}
                loading="lazy"
                decoding="async"
                className="nvx-gallery-img"
              />
            ) : (
              <span className="nvx-gallery-missing">No picture yet — choose one in the panel</span>
            );
            const tileClass = cn("nvx-gallery-tile", roundedClass[props.rounded]);
            return (
              <li key={index} className="nvx-gallery-item">
                <figure className="nvx-gallery-figure">
                  {lightbox ? (
                    <a
                      id={links[k].tile}
                      href={`#${links[k].id}`}
                      className={tileClass}
                      aria-label={openLabel(k + 1, pictures.length, image.alt)}
                    >
                      {picture}
                    </a>
                  ) : (
                    <div className={tileClass}>{picture}</div>
                  )}
                  {editing ? (
                    /*
                      One element whether or not there is a caption yet, so it
                      keeps its focus when the last letter is deleted or the
                      first one typed. Empty, it hangs over the foot of the
                      tile and shows only while that tile is hovered — in the
                      flow it would push every row down by a line the
                      published page does not have.
                    */
                    <Editable
                      as="figcaption"
                      value={image.caption ?? ""}
                      onChange={(caption) => setCaption(index, caption)}
                      placeholder="Add a caption"
                      className={cn("nvx-gallery-caption", isBlank(image.caption) && "nvx-gallery-caption-add")}
                    />
                  ) : !isBlank(image.caption) ? (
                    <Editable as="figcaption" disabled value={image.caption ?? ""} onChange={noop} className="nvx-gallery-caption" />
                  ) : null}
                </figure>
              </li>
            );
          })}
        </ul>
      </div>

      {lightbox && disabled ? (
        <div className="nvx-gallery-lightboxes">
          {pictures.map(({ image, index }, k) => (
            <div
              key={index}
              id={links[k].id}
              className="nvx-gallery-lightbox"
              role="dialog"
              // Honest only because globals.css hides the rest of the page
              // while this is open, so nothing outside it can be focused or
              // read — see the `visibility` rule in the gallery's region.
              aria-modal="true"
              aria-label={`Picture ${k + 1} of ${pictures.length}`}
              // Following a link to an element that can take focus gives it
              // focus, so opening a picture puts a keyboard or screen reader
              // inside this overlay instead of leaving them on the tile
              // behind it.
              tabIndex={-1}
            >
              {/* Clicking anywhere off the picture closes it, as a lightbox is
                  expected to. It is a second way to do what "Close" does, so
                  it is kept out of the tab order and out of what is read. */}
              <a href={`#${links[k].tile}`} className="nvx-gallery-lightbox-backdrop" tabIndex={-1} aria-hidden="true" />
              <figure className="nvx-gallery-lightbox-figure" data-captioned={isBlank(image.caption) ? undefined : "true"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.src}
                  alt={image.alt || ""}
                  width={image.naturalWidth || undefined}
                  height={image.naturalHeight || undefined}
                  // Lazy, so sixty overlays are not sixty downloads the moment
                  // the page opens: a hidden overlay is not rendered, and a
                  // lazy picture that is not rendered is not fetched.
                  loading="lazy"
                  decoding="async"
                  className="nvx-gallery-lightbox-img"
                />
                {!isBlank(image.caption) ? (
                  <Editable as="figcaption" disabled value={image.caption ?? ""} onChange={noop} className="nvx-gallery-lightbox-caption" />
                ) : null}
              </figure>
              <p className="nvx-gallery-lightbox-count" aria-hidden="true">
                {k + 1} / {pictures.length}
              </p>
              <a href={`#${links[k].tile}`} className="nvx-gallery-lightbox-button nvx-gallery-lightbox-close" aria-label="Close">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </a>
              {links[k].previous ? (
                <a href={`#${links[k].previous}`} className="nvx-gallery-lightbox-button nvx-gallery-lightbox-previous" aria-label="Previous picture">
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
                    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ) : null}
              {links[k].next ? (
                <a href={`#${links[k].next}`} className="nvx-gallery-lightbox-button nvx-gallery-lightbox-next" aria-label="Next picture">
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
                    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {editing && !full ? (
        <div className="nvx-block-chrome absolute left-2 top-2 z-10 flex items-center gap-2 rounded-md bg-bg-card/95 border border-bg-border px-2 py-1 shadow-lg">
          <button onClick={() => setPicking(true)} className="text-xs text-fg-muted hover:text-fg underline">
            Add picture
          </button>
        </div>
      ) : null}
      {picker}
    </div>
  );
}
