import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { validateUploadFile, isDangerousExtension, sanitizeSvg, isRenderableSvg } from "@/lib/security";
import { imageSize } from "@/lib/image-size";
import { matchesType, stripImageMetadata, uploadDir } from "@/lib/uploads";
import { prisma } from "@/lib/prisma";
import { cleanName, fileNameFromUrl } from "@/lib/media";

/**
 * Remember what the file was called when it arrived. It is stored under a
 * generated name so two uploads cannot collide, which used to mean the
 * library listed "mu59seflqpe0.png" and the customer's own name for the
 * picture was thrown away at the door.
 */
async function remember(url: string, original: string) {
  const name = cleanName(original) || fileNameFromUrl(url);
  await prisma.mediaFile.create({ data: { url, name } }).catch(() => {
    // A library entry is a convenience; an upload that cannot be described
    // is still an upload, and the file is already on disk.
  });
}

export const dynamic = "force-dynamic";

/** The route's own cap, checked before the body is read rather than after. */
const MAX_UPLOAD = 10 * 1024 * 1024;
/** Room for the multipart envelope around a file of that size. */
const MAX_BODY = MAX_UPLOAD + 1024 * 1024;

function tooLarge() {
  return NextResponse.json(
    { error: `That file is larger than ${MAX_UPLOAD / 1024 / 1024} MB, so it was not read.` },
    { status: 413 },
  );
}

/** A name nothing else is using, in the extension the file claimed. */
function generatedName(ext: string): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

// POST /api/upload — accepts a single file, saves to public/uploads/
export async function POST(req: NextRequest) {
  // `formData()` buffers the whole body before anything looks at its size: a
  // single 200 MB upload grew the process by about 825 MB before the 400 it
  // was always going to get. Content-Length is a hint a client controls, but
  // it is the one that costs nothing.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY) return tooLarge();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // A body that is not multipart used to throw into a 500 and a stack trace.
    return NextResponse.json({ error: "That upload could not be read." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string" || typeof (file as File).arrayBuffer !== "function") {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  const upload = file as File;

  const validation = validateUploadFile(upload.name, upload.size);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  // `size` is what the client declared; this is what arrived.
  if (bytes.length > MAX_UPLOAD) return tooLarge();

  const dir = uploadDir();
  await mkdir(dir, { recursive: true });

  // If SVG, strip all known XSS vectors
  if (isDangerousExtension(validation.ext)) {
    const sanitized = sanitizeSvg(bytes.toString("utf8"));
    // Everything the file had was stripped, so there is no picture left to
    // store. Saying so beats saving a blank that draws nothing.
    if (!isRenderableSvg(sanitized)) {
      return NextResponse.json(
        { error: "That SVG had nothing drawable left once the scripts were taken out." },
        { status: 400 },
      );
    }
    const filename = generatedName(validation.ext);
    // `turbopackIgnore` because `dir` is the uploads directory, resolved at
    // request time from NEURAVEX_UPLOAD_DIR. Turbopack cannot see it
    // statically and so traces the whole project — the source tree and
    // `public/` — into the server output on the strength of it.
    const svgPath = join(/*turbopackIgnore: true*/ dir, filename);
    await writeFile(svgPath, Buffer.from(sanitized, "utf8"), { mode: 0o600 });
    const svgUrl = `/uploads/${filename}`;
    await remember(svgUrl, upload.name);
    // An SVG scales to whatever box it is given, so there is nothing to report.
    return NextResponse.json({ url: svgUrl, name: cleanName(upload.name) || filename });
  }

  // The extension was the only content check there was, so a picker's
  // `accept="image/*"` was the whole of it. Uploads are served with a content
  // type taken from the extension and `nosniff`, so this is not what stops a
  // file being read as a document — it is what stops the mismatch existing.
  if (!matchesType(validation.ext, bytes)) {
    return NextResponse.json(
      { error: `That file is not a .${validation.ext} — its contents do not match its name.` },
      { status: 400 },
    );
  }

  // A photograph off a phone carries the coordinates it was taken at, the
  // device and often the photographer's name, and all of it went onto the
  // public web and into the customer's download byte for byte.
  const clean = Buffer.from(stripImageMetadata(bytes));

  const filename = generatedName(validation.ext);
  // Same runtime uploads directory as the SVG branch above.
  const imagePath = join(/*turbopackIgnore: true*/ dir, filename);
  await writeFile(imagePath, clean, { mode: 0o600 });

  const url = `/uploads/${filename}`;
  await remember(url, upload.name);
  // The size travels with the picture so a page can reserve its space.
  const size = imageSize(clean);
  return NextResponse.json({ url, name: cleanName(upload.name) || filename, ...(size ?? {}) });
}
