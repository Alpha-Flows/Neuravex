import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { writeFile, mkdir, readFile, readdir, rename, stat, unlink } from "fs/promises";
import { join } from "path";
import { gate } from "@/proxy";
import { validateUploadFile, isDangerousExtension, sanitizeSvg, isRenderableSvg } from "@/lib/security";
import { imageSize } from "@/lib/image-size";
import { existingUploadPath, matchesType, stripImageMetadata, uploadDir } from "@/lib/uploads";
import { prisma } from "@/lib/prisma";
import { cleanName, fileNameFromUrl } from "@/lib/media";
import { mediaKindOf, tooLargeMessage, uploadLimitFor } from "@/lib/media-kind";
import { readBodyBytes } from "@/lib/request-body";

/**
 * Remember what the file was called when it arrived. It is stored under a
 * generated name so two uploads cannot collide, which used to mean the
 * library listed "mu59seflqpe0.png" and the customer's own name for the
 * picture was thrown away at the door.
 */
async function remember(url: string, original: string, size?: { width: number; height: number } | null) {
  const name = cleanName(original) || fileNameFromUrl(url);
  await prisma.mediaFile.create({ data: { url, name, ...(size ? { width: size.width, height: size.height } : {}) } }).catch(() => {
    // A library entry is a convenience; an upload that cannot be described
    // is still an upload, and the file is already on disk.
  });
}

export const dynamic = "force-dynamic";

/**
 * A multipart upload, the old way in: read whole, so held to the smallest
 * limit. Everything larger is sent as the file itself — see `fromStream`.
 */
const MAX_FORM_UPLOAD = 10 * 1024 * 1024;
/** Room for the multipart envelope around a file of that size. */
const MAX_FORM_BODY = MAX_FORM_UPLOAD + 1024 * 1024;

/**
 * Where a file is written while it arrives, inside the upload directory so
 * the finished one is moved into place rather than copied. A folder, because
 * the library lists the files in the upload directory and would otherwise
 * offer half a video as something to put on a page.
 */
const INCOMING = ".incoming";

/** A file left in `INCOMING` this long is from an upload that never finished. */
const ABANDONED_AFTER = 24 * 60 * 60 * 1000;

/** A name nothing else is using, in the extension the file claimed. */
function generatedName(ext: string): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

function refused(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/**
 * POST /api/upload — one file, stored under `uploadDir()`.
 *
 * The proxy does not run on this route: Next copies every body the proxy sees
 * into memory and cuts it off at 10 MB, which held every video to about a
 * minute. So the Host allowlist and the Origin check the proxy would have
 * applied are applied here, first, before a byte of the body is read.
 */
export async function POST(req: NextRequest) {
  const refusal = gate(req);
  if (refusal) return refusal;

  const type = req.headers.get("content-type") ?? "";
  return /^multipart\/form-data/i.test(type) ? fromForm(req) : fromStream(req);
}

/**
 * The file sent as the body itself, named by `X-File-Name`, which is how the
 * builder sends every upload.
 *
 * Written to disk as it arrives and never held whole, so a video's limit is
 * what the disk will take rather than what memory will. `formData()` buffered
 * the body several times over before anything looked at its size: a single
 * 200 MB upload grew the process by about 825 MB. The count is kept here,
 * against the limit for the kind of file the name says it is, and the upload
 * stops the moment it passes it, whatever Content-Length claimed.
 */
async function fromStream(req: NextRequest): Promise<NextResponse> {
  const name = decodeName(req.headers.get("x-file-name"));
  if (!name) return refused("No file");

  const validation = validateUploadFile(name, 0);
  if (!validation.valid) return refused(validation.error);
  const limit = uploadLimitFor(name);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return refused(tooLargeMessage(name), 413);
  if (!req.body) return refused("No file");

  const dir = uploadDir();
  const incoming = join(/*turbopackIgnore: true*/ dir, INCOMING);
  await mkdir(incoming, { recursive: true });
  void sweep(incoming);

  const partial = join(/*turbopackIgnore: true*/ incoming, generatedName(validation.ext));
  const arrived = await streamToFile(req.body, partial, limit);
  if (!arrived.ok) {
    await unlink(partial).catch(() => {});
    return arrived.status === 413 ? refused(tooLargeMessage(name), 413) : refused("That upload was cut off before it finished.");
  }
  if (arrived.size === 0) {
    await unlink(partial).catch(() => {});
    return refused("That file is empty.");
  }
  // Fewer bytes than the client said it was sending is a file cut short —
  // which is what Next's own 10 MB cut would look like, were this route ever
  // put back behind the proxy — and is not kept as though it were whole.
  if (Number.isFinite(declared) && declared > 0 && arrived.size !== declared) {
    await unlink(partial).catch(() => {});
    return refused("That upload was cut off before it finished.");
  }

  // A smaller copy of a picture already in the library, made in the
  // browser; see `sendPicture`. Named by the picture it is a copy of, which
  // has to be there, and a picture itself, and not a copy of another.
  const variantOf = req.headers.get("x-variant-of");
  let copyOf: string | undefined;
  if (variantOf !== null) {
    const found = await variantTarget(variantOf, validation.ext);
    if (!found.ok) {
      await unlink(partial).catch(() => {});
      return refused(found.error);
    }
    copyOf = found.url;
  }

  const kind = mediaKindOf(name);
  if (kind === "audio" || kind === "video") {
    // Nothing is rewritten in a sound or a video, so the file is checked by
    // its first bytes and moved into place as it arrived.
    if (!matchesType(validation.ext, arrived.head)) {
      await unlink(partial).catch(() => {});
      return mismatch(validation.ext);
    }
    const filename = generatedName(validation.ext);
    await rename(partial, join(/*turbopackIgnore: true*/ dir, filename));
    const url = `/uploads/${filename}`;
    await remember(url, name);
    return NextResponse.json({ url, name: cleanName(name) || filename });
  }

  // A picture or a document is 10 MB at most, and is checked and cleaned
  // whole, exactly as a form upload is.
  const bytes = await readFile(partial);
  await unlink(partial).catch(() => {});
  return store(bytes, name, validation.ext, copyOf);
}

/** Picture formats a copy may be in: the ones a browser encodes. */
const VARIANT_EXTENSIONS = new Set(["webp", "jpg", "jpeg", "png"]);

async function variantTarget(value: string, ext: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!VARIANT_EXTENSIONS.has(ext)) return { ok: false, error: "A smaller copy has to be a picture." };
  const url = value.trim();
  const match = /^\/uploads\/([^/]+)$/.exec(url);
  if (!match || !existingUploadPath(match[1])) return { ok: false, error: "The picture this is a copy of is not in the library." };
  const record = await prisma.mediaFile.findUnique({ where: { url }, select: { variantOf: true } });
  if (!record || record.variantOf) return { ok: false, error: "The picture this is a copy of is not in the library." };
  const copies = await prisma.mediaFile.count({ where: { variantOf: url } });
  if (copies >= MAX_VARIANTS) return { ok: false, error: "That picture has all the copies it can have." };
  return { ok: true, url };
}

/** More copies of one picture than the widths it is ever drawn at is a mistake, or worse. */
const MAX_VARIANTS = 6;

/**
 * A multipart form, as older scripts and the test suite send one. Read in
 * full, so no larger than a form upload may be, however it is framed: with
 * the proxy out of the way nothing else caps it, and `formData()` on its own
 * reads whatever arrives.
 */
async function fromForm(req: NextRequest): Promise<NextResponse> {
  const body = await readBodyBytes(req, MAX_FORM_BODY);
  if (!body.ok) {
    if (body.response.status !== 413) return body.response;
    return refused(
      `That upload is larger than ${MAX_FORM_UPLOAD / 1024 / 1024} MB, the most a form can carry. ` +
        "Send the file itself as the body, with its name in an X-File-Name header, as the builder does.",
      413,
    );
  }

  let form: FormData;
  try {
    form = await new Response(Buffer.from(body.body), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    // A body that is not multipart used to throw into a 500 and a stack trace.
    return refused("That upload could not be read.");
  }

  const file = form.get("file");
  if (!file || typeof file === "string" || typeof (file as File).arrayBuffer !== "function") {
    return refused("No file");
  }
  const upload = file as File;

  const validation = validateUploadFile(upload.name, upload.size);
  if (!validation.valid) return refused(validation.error);

  const bytes = Buffer.from(await upload.arrayBuffer());
  // `size` is what the client declared; this is what arrived.
  if (bytes.length > uploadLimitFor(upload.name)) return refused(tooLargeMessage(upload.name), 413);
  return store(bytes, upload.name, validation.ext);
}

/** A picture or a document, checked, cleaned and written. */
async function store(bytes: Buffer, original: string, ext: string, variantOf?: string): Promise<NextResponse> {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });

  // If SVG, strip all known XSS vectors
  if (isDangerousExtension(ext)) {
    const sanitized = sanitizeSvg(bytes.toString("utf8"));
    // Everything the file had was stripped, so there is no picture left to
    // store. Saying so beats saving a blank that draws nothing.
    if (!isRenderableSvg(sanitized)) {
      return refused("That SVG had nothing drawable left once the scripts were taken out.");
    }
    const filename = generatedName(ext);
    // `turbopackIgnore` because `dir` is the uploads directory, resolved at
    // request time from NEURAVEX_UPLOAD_DIR. Turbopack cannot see it
    // statically and so traces the whole project — the source tree and
    // `public/` — into the server output on the strength of it.
    const svgPath = join(/*turbopackIgnore: true*/ dir, filename);
    await writeFile(svgPath, Buffer.from(sanitized, "utf8"), { mode: 0o600 });
    const svgUrl = `/uploads/${filename}`;
    await remember(svgUrl, original);
    // An SVG scales to whatever box it is given, so there is nothing to report.
    return NextResponse.json({ url: svgUrl, name: cleanName(original) || filename });
  }

  // The extension was the only content check there was, so a picker's
  // `accept="image/*"` was the whole of it. Uploads are served with a content
  // type taken from the extension and `nosniff`, so this is not what stops a
  // file being read as a document — it is what stops the mismatch existing.
  if (!matchesType(ext, bytes)) return mismatch(ext);

  // A photograph off a phone carries the coordinates it was taken at, the
  // device and often the photographer's name, and all of it went onto the
  // public web and into the customer's download byte for byte.
  const clean = Buffer.from(stripImageMetadata(bytes));

  const filename = generatedName(ext);
  // Same runtime uploads directory as the SVG branch above.
  const imagePath = join(/*turbopackIgnore: true*/ dir, filename);
  await writeFile(imagePath, clean, { mode: 0o600 });

  const url = `/uploads/${filename}`;
  // The size travels with the picture so a page can reserve its space, and
  // is kept, so that a page offering its copies can say how wide each is.
  const size = imageSize(clean);
  if (variantOf) {
    // A copy is known by the picture it copies, and only listed as part of it.
    if (!size) {
      await unlink(imagePath).catch(() => {});
      return refused("That copy is not a picture the library can read.");
    }
    await prisma.mediaFile.create({
      data: { url, name: cleanName(original) || filename, width: size.width, height: size.height, variantOf },
    });
    await rememberSize(variantOf);
    return NextResponse.json({ url, name: cleanName(original) || filename, ...size });
  }
  await remember(url, original, size);
  return NextResponse.json({ url, name: cleanName(original) || filename, ...(size ?? {}) });
}

/**
 * The size of a picture uploaded before sizes were kept, read from its file
 * when a copy of it arrives: without it the picture cannot stand in its own
 * `srcset` beside its copies.
 */
async function rememberSize(url: string) {
  const record = await prisma.mediaFile.findUnique({ where: { url }, select: { width: true } });
  if (!record || record.width) return;
  const path = existingUploadPath(url.slice("/uploads/".length));
  const size = path ? imageSize(await readFile(path).catch(() => Buffer.alloc(0))) : null;
  if (size) await prisma.mediaFile.update({ where: { url }, data: { width: size.width, height: size.height } });
}

function mismatch(ext: string) {
  return refused(`That file is not a .${ext} — its contents do not match its name.`);
}

/** The name the builder sent, URI-encoded so any name fits in a header. */
function decodeName(value: string | null): string | null {
  if (!value) return null;
  try {
    const name = decodeURIComponent(value).trim();
    // A name is a name: no path, and nothing that is not printable.
    return name && !/[\u0000-\u001f\u007f/\\]/.test(name) ? name : null;
  } catch {
    return null;
  }
}

type Arrival = { ok: true; size: number; head: Uint8Array } | { ok: false; status: 400 | 413 };

/**
 * The body written to `path`, counted as it goes, and stopped past `limit`.
 * The first bytes are kept aside, since they are what says what the file is.
 */
async function streamToFile(body: ReadableStream<Uint8Array>, path: string, limit: number): Promise<Arrival> {
  const out = createWriteStream(path, { flags: "wx", mode: 0o600 });
  const failed = new Promise<never>((_, reject) => out.once("error", reject));
  failed.catch(() => {});
  const reader = body.getReader();
  let size = 0;
  let head = new Uint8Array(0);

  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), failed]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        out.destroy();
        return { ok: false, status: 413 };
      }
      if (head.byteLength < 16) head = Uint8Array.from([...head, ...value.subarray(0, 16 - head.byteLength)]);
      if (!out.write(value)) await Promise.race([new Promise<void>((resolve) => out.once("drain", () => resolve())), failed]);
    }
    await Promise.race([new Promise<void>((resolve) => out.end(() => resolve())), failed]);
    return { ok: true, size, head };
  } catch {
    await reader.cancel().catch(() => {});
    out.destroy();
    return { ok: false, status: 400 };
  }
}

/**
 * Takes away what uploads that never finished left behind: the connection
 * dropped, or the server was stopped part-way through a video.
 */
async function sweep(incoming: string) {
  const names = await readdir(incoming).catch(() => [] as string[]);
  const now = Date.now();
  for (const name of names) {
    const full = join(/*turbopackIgnore: true*/ incoming, name);
    const info = await stat(full).catch(() => null);
    if (info?.isFile() && now - info.mtimeMs > ABANDONED_AFTER) await unlink(full).catch(() => {});
  }
}
