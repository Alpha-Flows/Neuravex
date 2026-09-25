/**
 * The part of a file a `Range` header asks for, for the uploads route.
 *
 * `src/app/uploads/[name]/route.ts` answered every request with the whole
 * file and a 200, and said nothing about ranges. For a picture that is all
 * there is to it. For the audio block it meant the published page's player
 * could not seek: Chrome, told nothing about ranges, reported the recording
 * as seekable from 0 to 0 and put the playhead back at the start whenever
 * somebody dragged it — a three-second test file, fully downloaded, still
 * would not move to 2.5 s. Safari goes further and will not play a sound or a
 * video from a server that ignores ranges at all. The downloaded site was
 * never affected, because every static host and `file://` answer ranges.
 *
 * Only one range, and only the three forms a media element sends:
 * `bytes=0-`, `bytes=100-199` and `bytes=-500`. A header asking for several
 * ranges at once, or in a unit other than bytes, is answered with the whole
 * file, which the specification allows and every client understands; a
 * multipart reply is a lot of code for a request no player makes.
 *
 * Returns the first and last byte to send, inclusive; `null` for "send the
 * whole file"; or "unsatisfiable" when the range starts past the end, which
 * the route answers with 416.
 */
export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string | null | undefined, size: number): ByteRange | null | "unsatisfiable" {
  if (!header || !Number.isSafeInteger(size) || size < 0) return null;
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!match) return null;
  const [, first, last] = match;
  if (first === "" && last === "") return null;

  if (first === "") {
    // The last N bytes. Asking for more than there is means all of it — and
    // all of an empty file is nothing, which is a plain 200, not the range
    // 0 to -1 this used to hand back for the route to choke on.
    const length = Number(last);
    if (!Number.isSafeInteger(length)) return null;
    if (length === 0) return "unsatisfiable";
    if (size === 0) return null;
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(first);
  if (!Number.isSafeInteger(start)) return null;
  if (start >= size) return "unsatisfiable";

  const end = last === "" ? size - 1 : Number(last);
  if (!Number.isSafeInteger(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}
