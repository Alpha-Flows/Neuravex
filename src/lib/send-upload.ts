import { tooLargeMessage, uploadLimitFor } from "./media-kind";
import { preparePicture } from "./image-prep";

/** What the upload route answers, or why there is nothing to use. */
export type UploadResult =
  | { ok: true; url: string; name: string; width?: number; height?: number }
  | { ok: false; error: string };

/**
 * One file to the upload route, sent as the body itself.
 *
 * A form upload is read whole by the server, so it is held to the smallest
 * limit there is. Sent as it is, a file is written to disk as it arrives,
 * which is what lets a video be a few minutes long. The name travels in a
 * header, encoded, since a header cannot carry every name a file can have.
 *
 * A file over its limit is refused here, before any of it is sent: a
 * 300 MB recording used to be uploaded in full just to be told it was too
 * large.
 */
export async function sendUpload(file: File, options: { variantOf?: string } = {}): Promise<UploadResult> {
  if (file.size > uploadLimitFor(file.name)) return { ok: false, error: tooLargeMessage(file.name) };

  // A file that says it is a form would be read as one; it is only bytes.
  const type = file.type && !/^multipart\//i.test(file.type) ? file.type : "application/octet-stream";
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": type,
        "X-File-Name": encodeURIComponent(file.name),
        // A smaller copy of a picture already sent; see `sendPicture`.
        ...(options.variantOf ? { "X-Variant-Of": options.variantOf } : {}),
      },
      body: file,
    });
    const info = await res.json().catch(() => ({}));
    if (res.ok && typeof info.url === "string") {
      return { ok: true, url: info.url, name: info.name, width: info.width, height: info.height };
    }
    // The route says why — too large, contents not matching the name — and
    // that is the message worth showing.
    return { ok: false, error: typeof info.error === "string" ? info.error : "That file could not be uploaded." };
  } catch {
    return { ok: false, error: "That file could not be uploaded." };
  }
}

/** Whether pictures are made lighter on the way in; see `sendPicture`. */
const OPTIMISE_KEY = "nvx-optimise-pictures";

/** Whether this browser is set to make pictures lighter; on unless turned off. */
export function optimisingPictures(): boolean {
  try {
    return window.localStorage.getItem(OPTIMISE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setOptimisingPictures(on: boolean): void {
  try {
    window.localStorage.setItem(OPTIMISE_KEY, on ? "on" : "off");
  } catch {
    // A browser that keeps nothing keeps the default.
  }
}

/** What a picture's upload did to it, for the library to say. */
export type PictureResult = UploadResult & { before?: number; after?: number; copies?: number };

/**
 * A picture to the library, made lighter first: kept no wider than a page
 * will ever draw it, encoded as WebP, and sent with smaller copies of itself
 * that a page offers a phone instead. See `image-plan`.
 *
 * The copies are a convenience and go up after the picture: one that fails
 * leaves the picture as it is, used at its full size, which is what every
 * picture was before. `optimise` off sends the file exactly as chosen, for
 * the photographer who wants every pixel.
 */
export async function sendPicture(file: File, optimise = optimisingPictures()): Promise<PictureResult> {
  const prepared = optimise ? await preparePicture(file) : null;
  if (!prepared) return sendUpload(file);
  const sent = await sendUpload(prepared.main);
  if (!sent.ok) return sent;
  let copies = 0;
  for (const variant of prepared.variants) {
    const copy = await sendUpload(variant.file, { variantOf: sent.url });
    if (copy.ok) copies += 1;
  }
  return { ...sent, ...(prepared.redrawn ? { before: file.size, after: prepared.main.size } : {}), copies };
}
