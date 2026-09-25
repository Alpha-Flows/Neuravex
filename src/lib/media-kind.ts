/**
 * What kind of thing an uploaded file is, from its name alone.
 *
 * The media library used to list every upload as a picture. It was only ever
 * asked for pictures, so an MP3, a PDF or a font somebody had uploaded for
 * another reason sat in the grid as a broken thumbnail, and clicking one put a
 * sound file into an image block's `src`, where it drew nothing on the page.
 * The same library now also chooses sounds for the audio block, so it has to
 * be able to tell the two apart — and a picker that lists only what it can use
 * is what fixes the broken thumbnails as well.
 *
 * The extension is the whole test, on purpose. It is what the upload route
 * checks the bytes against and what `src/app/uploads/[name]/route.ts` takes
 * the content type from, so a file whose name says `.mp3` is served as
 * `audio/mpeg` and nothing else; sniffing here would only ever disagree with
 * the server. These lists are the image, audio and video rows of
 * `CONTENT_TYPES` in `uploads.ts`, repeated rather than imported because that
 * module reads the disk and this one runs in the picker — and a test in
 * `block-audio.test.ts` ("the lists agree with what the server serves")
 * fails the moment the two stop agreeing.
 */

export type MediaKind = "image" | "audio" | "video" | "other";

/**
 * What the library can be asked to choose.
 *
 * Video joined late. Once the picker refused files that were not of its kind,
 * a video could no longer be uploaded anywhere in the builder, while the
 * video block's panel still spoke of "a video file that travels with this
 * site" — a file there was no way left to put in it.
 */
export type PickableKind = "image" | "audio" | "video";

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "ico"] as const;
export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg"] as const;
export const VIDEO_EXTENSIONS = ["mp4", "webm"] as const;

const KIND_OF_EXTENSION = new Map<string, MediaKind>([
  ...IMAGE_EXTENSIONS.map((ext) => [ext, "image"] as const),
  ...AUDIO_EXTENSIONS.map((ext) => [ext, "audio"] as const),
  ...VIDEO_EXTENSIONS.map((ext) => [ext, "video"] as const),
]);

/**
 * The extension of the file an address names, lower-cased, or "".
 *
 * Only the last path segment counts, and the query and fragment are cut off
 * first: `https://cdn.example/feed.xml?file=episode.mp3` is not a sound file,
 * and `/uploads/a.b/c` has no extension at all, whatever its folder is called.
 */
export function extensionOf(url: string): string {
  const path = url.split(/[?#]/, 1)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Whether an address is a picture, a sound, a video or something else.
 *
 * A `data:` address carries its type in front, so that is read instead of an
 * extension it does not have; the clipboard paste path produces a picture
 * that way.
 */
export function mediaKindOf(url: string): MediaKind {
  const trimmed = url.trim();
  const inline = /^data:([a-z]+)\//i.exec(trimmed);
  if (inline) {
    const family = inline[1].toLowerCase();
    return family === "image" || family === "audio" || family === "video" ? family : "other";
  }
  return KIND_OF_EXTENSION.get(extensionOf(trimmed)) ?? "other";
}

const MB = 1024 * 1024;

/**
 * How large an upload of each kind may be.
 *
 * One limit used to cover everything, 10 MB, and Next held a video to it in
 * any case by cutting every request body off there. Ten megabytes is a
 * photograph many times over and a minute of phone video, so the Video block
 * that took "a video file that travels with this site" could be given almost
 * none. A video is allowed a few minutes of 1080p now, and a sound an album
 * track; a picture or a document keeps the old limit, since every one of
 * them is read into memory to be checked and cleaned.
 *
 * Here, with no dependencies, so the picker can say a file is too large
 * before it has sent any of it.
 */
export const UPLOAD_LIMITS: Readonly<Record<MediaKind, number>> = {
  image: 10 * MB,
  audio: 50 * MB,
  video: 250 * MB,
  other: 10 * MB,
};

/** The limit for a file of this name. */
export function uploadLimitFor(name: string): number {
  return UPLOAD_LIMITS[mediaKindOf(name)];
}

/** The largest limit, which is what a request may carry at all. */
export const MAX_UPLOAD_LIMIT = Math.max(...Object.values(UPLOAD_LIMITS));

/** "That file is larger than 250 MB, the most a video may be." */
export function tooLargeMessage(name: string): string {
  const kind = mediaKindOf(name);
  const what = kind === "image" ? "a picture" : kind === "audio" ? "a sound" : kind === "video" ? "a video" : "a file of this kind";
  return `That file is larger than ${Math.round(UPLOAD_LIMITS[kind] / MB)} MB, the most ${what} may be.`;
}

/**
 * The file input's `accept`, per kind.
 *
 * Pictures keep `image/*`, which is what the picker has always said. Sounds
 * name their extensions as well as their types: a desktop file dialog filters
 * on whichever of the two it understands, and a WAV is `audio/wav` to one
 * system and `audio/x-wav` to another.
 */
export const ACCEPT: Record<PickableKind, string> = {
  image: "image/*",
  audio: [...AUDIO_EXTENSIONS.map((ext) => `.${ext}`), "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg"].join(","),
  // Named, not `video/*`: a QuickTime or an AVI would be offered by the
  // dialog and then refused by the upload route.
  video: [...VIDEO_EXTENSIONS.map((ext) => `.${ext}`), "video/mp4", "video/webm"].join(","),
};

const EXTENSIONS_OF: Record<PickableKind, readonly string[]> = {
  image: IMAGE_EXTENSIONS,
  audio: AUDIO_EXTENSIONS,
  video: VIDEO_EXTENSIONS,
};

/** The extensions of a kind, for a sentence: "MP3, WAV or OGG". */
export function extensionList(kind: PickableKind): string {
  const names = EXTENSIONS_OF[kind].map((ext) => ext.toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names.join("");
}

/**
 * The library, split into what a picker can choose and what it only lists.
 *
 * Choosing is filtered by kind. Listing is not allowed to be: the picker is
 * the only place an upload can be deleted, so when the picture library
 * stopped showing PDFs, fonts and video files as broken thumbnails, those
 * files could be uploaded and never removed again. The picture library is
 * the one every site can open, so it lists everything that is not a picture
 * as well, apart from the grid, for deleting. The sound and video libraries
 * open only from their own blocks and have nothing to add to that.
 */
export function libraryFor<T extends { url: string }>(files: T[], kind: PickableKind): { choosable: T[]; other: T[] } {
  const choosable = files.filter((f) => mediaKindOf(f.url) === kind);
  const other = kind === "image" ? files.filter((f) => mediaKindOf(f.url) !== "image") : [];
  return { choosable, other };
}
