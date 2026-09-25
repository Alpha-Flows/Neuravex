import { tooLargeMessage, uploadLimitFor } from "./media-kind";

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
export async function sendUpload(file: File): Promise<UploadResult> {
  if (file.size > uploadLimitFor(file.name)) return { ok: false, error: tooLargeMessage(file.name) };

  // A file that says it is a form would be read as one; it is only bytes.
  const type = file.type && !/^multipart\//i.test(file.type) ? file.type : "application/octet-stream";
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(file.name) },
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
