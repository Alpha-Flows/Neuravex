import { NextRequest, NextResponse } from "next/server";
import { constants } from "fs";
import { open, type FileHandle } from "fs/promises";
import { Readable } from "stream";
import { existingUploadPath, CONTENT_TYPES, servesInline } from "@/lib/uploads";
import { validateUploadFile } from "@/lib/security";
import { parseByteRange } from "@/lib/byte-range";

/**
 * Serving an uploaded file.
 *
 * Next 14 in production takes one snapshot of `public/` when it starts. The
 * upload route writes into `public/uploads` and hands back `/uploads/<name>`,
 * so the file was on disk, the library listed it, and the canvas, the
 * published page and the OG image all got a 404 until Neuravex was quit and
 * started again. Nobody attacked anything; it was simply broken in the mode
 * customers actually run, and the end-to-end suite never saw it because
 * Playwright runs the dev server, which reads `public/` every time.
 *
 * A route handler reads the file when it is asked for, so the URL works the
 * moment the upload lands. The shape of the URL is unchanged, so nothing
 * stored in anybody's pages has to move.
 *
 * It also closes two things Next's static serving could not:
 *
 *   - The file is `lstat`ed, so a symbolic link is refused. Nothing in the app
 *     creates one, but a shared volume or an untrusted backup restore can, and
 *     `ln -s .env public/uploads/link.png` served the environment file as
 *     `image/png` after a restart.
 *   - The content type comes from the extension and nothing else, with
 *     `nosniff`, and anything that is not a picture is sent as an attachment.
 *
 * And it answers a `Range` request with the part asked for. It sent the whole
 * file with a 200 every time, which is all a picture needs and not what a
 * player needs: told nothing about ranges, Chrome reported an uploaded
 * recording as seekable from 0 to 0 and put the playhead back at the start
 * whenever somebody dragged it, and Safari will not play a sound or a video
 * from a server that ignores ranges at all. See `parseByteRange` for which
 * requests are answered in part.
 *
 * And it streams what it sends. It read the whole file for every request,
 * which a picture never noticed and a video did: a player asks for a few
 * hundred kilobytes at a time, and each of those asks read all 250 MB into
 * memory to hand back a slice of it.
 */

export const dynamic = "force-dynamic";

/** Long enough to be worth it; short enough that a replaced file shows up. */
const CACHE = "private, max-age=3600, must-revalidate";

type Props = { params: Promise<{ name: string }> };

export async function GET(req: NextRequest, props: Props) {
  return serve(req, props, true);
}

/**
 * The headers alone. Next answers a HEAD with its GET and drops the body,
 * which for a streamed file would leave the file open until something
 * collected it; a player asks for these to learn a video's length.
 */
export async function HEAD(req: NextRequest, props: Props) {
  return serve(req, props, false);
}

async function serve(req: NextRequest, props: Props, withBody: boolean): Promise<NextResponse> {
  const params = await props.params;
  const name = decodeURIComponentSafe(params.name);
  if (!name) return notFound();

  // The extension decides what this is served as, so it has to be one we
  // recognise before anything is read.
  const check = validateUploadFile(name, 0);
  if (!check.valid) return notFound();

  // Contained inside the upload directory, a regular file, not a link.
  const full = existingUploadPath(name);
  if (!full) return notFound();

  // Opened without following a link, and measured through the same handle,
  // so what was checked above is what is sent: a link put in its place in
  // between is refused by the open rather than read.
  let file: FileHandle;
  let length: number;
  try {
    file = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return notFound();
  }
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("not a file");
    length = info.size;
  } catch {
    await file.close().catch(() => {});
    return notFound();
  }

  const type = CONTENT_TYPES[check.ext] ?? "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": CACHE,
    // A PDF, a font or a video is a file somebody is fetching, not a
    // document this origin should render.
    "Content-Disposition": servesInline(check.ext)
      ? "inline"
      : `attachment; filename="${name.replace(/["\\]/g, "")}"`,
  };

  const range = parseByteRange(req.headers.get("range"), length);
  if (range === "unsatisfiable" || !withBody) await file.close().catch(() => {});
  if (range === "unsatisfiable") {
    return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${length}` } });
  }
  if (range) {
    return new NextResponse(withBody ? body(file, range.start, range.end) : null, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${length}`,
      },
    });
  }
  return new NextResponse(withBody ? body(file, 0, length - 1) : null, {
    headers: { ...headers, "Content-Length": String(length) },
  });
}

/** Bytes `start` to `end` of the file, inclusive, read as they are sent. */
function body(file: FileHandle, start: number, end: number): ReadableStream<Uint8Array> | null {
  if (end < start) {
    void file.close().catch(() => {});
    return null;
  }
  // Closed with the stream, however it ends — sent, or the player moved on.
  return Readable.toWeb(file.createReadStream({ start, end, autoClose: true })) as ReadableStream<Uint8Array>;
}

function decodeURIComponentSafe(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function notFound() {
  return new NextResponse("Not found", { status: 404 });
}
