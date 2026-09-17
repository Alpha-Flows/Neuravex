/**
 * How big a picture is, read from the file itself.
 *
 * An `<img>` with no width and height leaves the browser nothing to reserve,
 * so a page jumps as each picture arrives — the heading you were reading slides
 * away under you. Knowing the size lets the space be held before the bytes
 * turn up.
 *
 * This reads the few bytes of header that carry the dimensions rather than
 * decoding anything, and covers the formats Neuravex accepts. No dependency:
 * these headers are small, fixed and well specified, and an image library for
 * four numbers is not a trade worth making.
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** PNG: the IHDR chunk is always first, and holds both dimensions. */
function pngSize(buf: Buffer): ImageSize | null {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * JPEG: walk the markers to the frame header. The dimensions live in whichever
 * SOF segment the encoder used, which is why this cannot just read an offset.
 */
function jpegSize(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1; // Resynchronise rather than give up on a padded stream.
      continue;
    }
    const marker = buf[offset + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    // SOF0–SOF15, minus the four that are not frame headers.
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrameHeader) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** GIF: a fixed little-endian header. */
function gifSize(buf: Buffer): ImageSize | null {
  if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

/** WebP, in its three flavours: lossy, lossless and extended. */
function webpSize(buf: Buffer): ImageSize | null {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;

  const format = buf.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    const read24 = (at: number) => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  return null;
}

/** The picture's size, or null for anything unrecognised or truncated. */
export function imageSize(buf: Buffer): ImageSize | null {
  const size = pngSize(buf) ?? jpegSize(buf) ?? gifSize(buf) ?? webpSize(buf);
  if (!size) return null;
  // A zero or absurd dimension means we read the wrong bytes.
  if (size.width < 1 || size.height < 1 || size.width > 100000 || size.height > 100000) return null;
  return size;
}
