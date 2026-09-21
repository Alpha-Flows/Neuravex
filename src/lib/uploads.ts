import { lstatSync } from "fs";
import { join, resolve, sep } from "path";

/**
 * Everything about the files people upload: where they live, what they are,
 * and what gets written to disk.
 *
 * Three separate findings meet here. The bytes were stored unchanged and the
 * only content check was the extension (so a picker's `accept="image/*"` was
 * the whole of it); photographs kept their EXIF, including GPS; and the
 * exporter and the media library followed symbolic links placed in the upload
 * directory, so `ln -s .env public/uploads/link.png` put the environment file
 * in the library and in the customer's download.
 */

/**
 * Where uploads live.
 *
 * Not under `public/` any more. Next takes one snapshot of `public/` when it
 * builds, so a file written there afterwards was on disk, listed in the media
 * library, and a 404 on every page until Neuravex was restarted — and a
 * symbolic link dropped into the directory was served by Next's static
 * handler as whatever its extension claimed, with nothing in this app in a
 * position to refuse it. Outside `public/`, every read goes through the route
 * handler in `src/app/uploads/[name]/route.ts`, which checks both.
 *
 * The URL shape is unchanged, so nothing stored in anybody's pages moves.
 */
export function uploadDir(): string {
  const configured = process.env.NEURAVEX_UPLOAD_DIR?.trim();
  return configured ? resolve(configured) : join(process.cwd(), "data", "uploads");
}

/**
 * Where uploads used to live.
 *
 * Read, never written. An installation that predates the move still has its
 * pictures here, and a page pointing at one has to keep working.
 */
export function legacyUploadDir(): string {
  return join(process.cwd(), "public", "uploads");
}

/** Both directories, newest location first. */
export function uploadDirs(): string[] {
  const dirs = [uploadDir()];
  const legacy = legacyUploadDir();
  if (legacy !== dirs[0]) dirs.push(legacy);
  return dirs;
}

/** True when a name is one path segment and nothing clever. */
export function isUploadName(name: string): boolean {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("\0")) return false;
  return name !== "." && name !== "..";
}

/**
 * The absolute path one upload would have in a given directory, or null.
 *
 * Resolved and then checked to be inside that directory — the resolve is what
 * catches the cases a character check does not think of.
 */
export function pathIn(dir: string, name: string): string | null {
  if (!isUploadName(name)) return null;
  const base = resolve(dir);
  const full = resolve(base, name);
  return full.startsWith(base + sep) ? full : null;
}

/**
 * Where one upload would be written. The current directory, always.
 *
 * Callers that need to *find* an existing file use `existingUploadPath`,
 * which also looks where files used to be kept.
 */
export function uploadPath(name: string): string | null {
  return pathIn(uploadDir(), name);
}

/**
 * The file one upload URL names, wherever it is kept, or null.
 *
 * `lstat`, not `stat`: a symbolic link is not an upload. Nothing in this app
 * creates one, but a shared volume or a restored backup can, and
 * `ln -s .env uploads/link.png` used to put the environment file into the
 * media library and into the customer's download.
 */
export function existingUploadPath(name: string): string | null {
  for (const dir of uploadDirs()) {
    const full = pathIn(dir, name);
    if (!full) continue;
    try {
      if (lstatSync(full).isFile()) return full;
    } catch {
      // Not here; try where files used to be kept.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// What the bytes actually are
// ---------------------------------------------------------------------------

/** The content type each allowed extension is served as. Never sniffed. */
export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

/** Extensions a browser will draw inline; everything else is a download. */
const INLINE = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "ico"]);

export function servesInline(ext: string): boolean {
  return INLINE.has(ext.toLowerCase());
}

function startsWith(bytes: Uint8Array, signature: number[], at = 0): boolean {
  if (bytes.length < at + signature.length) return false;
  return signature.every((byte, i) => bytes[at + i] === byte);
}

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  return startsWith(bytes, [...text].map((c) => c.charCodeAt(0)), at);
}

/**
 * Whether the bytes are what the extension says they are.
 *
 * Not a security boundary on its own — uploads are served with a content type
 * taken from the extension and `nosniff`, which is what actually stops HTML
 * stored as `.gif` being read as a document. It is the check that was missing:
 * `imageSize()` never rejected anything, so a picker's `accept` attribute was
 * the only thing between the upload route and a file of any kind.
 *
 * Formats with no fixed signature worth testing (SVG, which is XML and gets
 * its own sanitiser; ICO, whose header is two zero bytes) answer true.
 */
export function matchesType(ext: string, bytes: Uint8Array): boolean {
  switch (ext.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "gif":
      return ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a");
    case "webp":
      return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
    case "avif":
      return ascii(bytes, 4, "ftyp");
    case "mp4":
      return ascii(bytes, 4, "ftyp");
    case "webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "ogg":
      return ascii(bytes, 0, "OggS");
    case "mp3":
      // An ID3 tag, or a bare MPEG frame header.
      return ascii(bytes, 0, "ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case "wav":
      return ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE");
    case "pdf":
      return ascii(bytes, 0, "%PDF-");
    case "woff":
      return ascii(bytes, 0, "wOFF");
    case "woff2":
      return ascii(bytes, 0, "wOF2");
    case "ttf":
      return startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || ascii(bytes, 0, "true");
    case "otf":
      return ascii(bytes, 0, "OTTO") || startsWith(bytes, [0x00, 0x01, 0x00, 0x00]);
    case "svg":
    case "ico":
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * A picture, with what the camera wrote in the margins taken out.
 *
 * A JPEG off a phone carries an EXIF block, and that block routinely carries
 * the coordinates the photograph was taken at, the device, and the
 * photographer's name. Uploading it put all of that on the public web and into
 * the customer's downloaded site, byte for byte, with nothing anywhere saying
 * so. There is no dependency here that can strip it, so this does it by hand,
 * in the style of `image-size.ts`: walk the container, drop the chunks that
 * hold metadata, keep the ones that hold the picture.
 *
 * Orientation is the one thing worth keeping, and it lives in the EXIF block
 * being dropped — so a minimal EXIF carrying only that tag is written back,
 * otherwise a photograph taken sideways would come out sideways.
 *
 * Anything this does not recognise is returned untouched: a format it cannot
 * parse is a format it cannot safely edit.
 */
export function stripImageMetadata(bytes: Uint8Array): Uint8Array {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return stripJpeg(bytes);
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return stripPng(bytes);
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return stripWebp(bytes);
  return bytes;
}

/** JPEG markers that carry metadata rather than picture. */
const JPEG_DROP = new Set([
  0xe1, // APP1 — EXIF and XMP
  0xe2, // APP2 — ICC, FlashPix
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec,
  0xed, // APP13 — Photoshop IRB, IPTC
  0xee, 0xef,
  0xfe, // COM — comment
]);

/** The orientation tag, in a minimal little-endian EXIF block. */
function minimalExif(orientation: number): Uint8Array {
  // APP1 length (2) + "Exif\0\0" (6) + TIFF header (8) + count (2)
  // + one 12-byte entry + next-IFD offset (4) = 32 bytes after the marker.
  const body = new Uint8Array(32);
  const view = new DataView(body.buffer);
  view.setUint16(0, 32); // segment length, including these two bytes
  body.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 2); // "Exif\0\0"
  body.set([0x49, 0x49, 0x2a, 0x00], 8); // "II*\0" — little-endian TIFF
  view.setUint32(12, 8, true); // offset of IFD0 from the TIFF header
  view.setUint16(16, 1, true); // one entry
  view.setUint16(18, 0x0112, true); // tag: Orientation
  view.setUint16(20, 3, true); // type: SHORT
  view.setUint32(22, 1, true); // count
  view.setUint16(26, orientation, true); // value, in the first 2 of 4 bytes
  view.setUint32(28, 0, true); // no next IFD
  return body;
}

/** The orientation an EXIF APP1 segment declares, or 0. */
function readOrientation(segment: Uint8Array): number {
  if (!ascii(segment, 0, "Exif")) return 0;
  const tiff = 6;
  if (segment.length < tiff + 8) return 0;
  const little = segment[tiff] === 0x49;
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > segment.length) return 0;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > segment.length) break;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 0;
    }
  }
  return 0;
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const keep: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let orientation = 0;
  let i = 2;

  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break; // Not where a marker should be; stop editing.
    const marker = bytes[i + 1];

    // Start of scan: the rest of the file is compressed picture.
    if (marker === 0xda) {
      keep.push(bytes.subarray(i));
      break;
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      keep.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) break;

    if (JPEG_DROP.has(marker)) {
      if (marker === 0xe1 && !orientation) {
        orientation = readOrientation(bytes.subarray(i + 4, i + 2 + length));
      }
    } else {
      keep.push(bytes.subarray(i, i + 2 + length));
    }
    i += 2 + length;
  }

  if (i + 4 > bytes.length && keep.length === 1) return bytes; // Nothing parsed.

  const parts = orientation
    ? [keep[0], new Uint8Array([0xff, 0xe1]), minimalExif(orientation), ...keep.slice(1)]
    : keep;
  return concat(parts);
}

/** PNG chunks that hold text or metadata rather than picture. */
const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

function stripPng(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;

  while (i + 12 <= bytes.length) {
    const length = view.getUint32(i);
    if (length > bytes.length) return bytes; // Malformed; leave it alone.
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const end = i + 12 + length;
    if (end > bytes.length) return bytes;

    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }

  return concat(parts);
}

/** WebP chunks that hold metadata. */
const WEBP_DROP = new Set(["EXIF", "XMP "]);

function stripWebp(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let i = 12; // "RIFF" + size + "WEBP"

  while (i + 8 <= bytes.length) {
    const type = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const length = view.getUint32(i + 4, true);
    // Chunks are padded to an even length.
    const end = i + 8 + length + (length % 2);
    if (end > bytes.length) return bytes;

    if (!WEBP_DROP.has(type)) parts.push(bytes.subarray(i, Math.min(end, bytes.length)));
    i = end;
  }

  if (parts.length === 0) return bytes;

  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  out.set(body, 12);
  // The RIFF size field counts everything after it.
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
