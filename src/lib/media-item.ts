import type { MediaItem } from "@/types";
import type { PickedImage } from "@/components/editor/MediaPicker";

/**
 * A gallery tile or a slide, after a picture has been chosen for it.
 *
 * The image block's rule, applied to one entry of a list: the file's size is
 * taken so the page can hold the space, and the library's description is
 * taken while nothing has been written here — or replaced when the last one
 * came from the library too, since it described the picture being swapped
 * out. Words somebody typed are never overwritten.
 */
export function withPicture(item: MediaItem | undefined, url: string, picked?: PickedImage): MediaItem {
  const base: MediaItem = item ?? { src: "", alt: "", caption: "" };
  const ownWords = !!base.alt?.trim() && !base.altFromLibrary;
  return {
    ...base,
    src: url,
    naturalWidth: picked?.naturalWidth,
    naturalHeight: picked?.naturalHeight,
    ...(ownWords ? {} : { alt: picked?.alt ?? "", altFromLibrary: !!picked?.alt }),
  };
}
