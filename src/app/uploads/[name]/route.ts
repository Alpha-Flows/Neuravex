import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existingUploadPath, CONTENT_TYPES, servesInline } from "@/lib/uploads";
import { validateUploadFile } from "@/lib/security";

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
 */

export const dynamic = "force-dynamic";

/** Long enough to be worth it; short enough that a replaced file shows up. */
const CACHE = "private, max-age=3600, must-revalidate";

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const name = decodeURIComponentSafe(params.name);
  if (!name) return notFound();

  // The extension decides what this is served as, so it has to be one we
  // recognise before anything is read.
  const check = validateUploadFile(name, 0);
  if (!check.valid) return notFound();

  // Contained inside the upload directory, a regular file, not a link.
  const full = existingUploadPath(name);
  if (!full) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(full);
  } catch {
    return notFound();
  }

  const type = CONTENT_TYPES[check.ext] ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": CACHE,
      // A PDF, a font or a video is a file somebody is fetching, not a
      // document this origin should render.
      "Content-Disposition": servesInline(check.ext)
        ? "inline"
        : `attachment; filename="${name.replace(/["\\]/g, "")}"`,
    },
  });
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
