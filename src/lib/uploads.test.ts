import { describe, it, expect } from "vitest";
import { uploadPath, isUploadName, pathIn, matchesType, stripImageMetadata, servesInline, CONTENT_TYPES } from "@/lib/uploads";

describe("which file an upload URL names", () => {
  it("accepts an ordinary generated name, outside public/", () => {
    // Uploads moved out of `public/`: Next serves that directory as it looked
    // when it was built, so a file written there afterwards 404ed until a
    // restart and a symbolic link in it was served as whatever its extension
    // claimed.
    const path = uploadPath("mu59seflqpe0.png");
    expect(path).toMatch(/uploads[/\\]mu59seflqpe0\.png$/);
    expect(path).not.toMatch(/[/\\]public[/\\]/);
  });

  it("refuses anything that is not one path segment", () => {
    for (const name of ["../.env", "a/b.png", "..\\.env", "", ".", "..", "a\0b.png"]) {
      expect(isUploadName(name), name).toBe(false);
      expect(uploadPath(name), name).toBeNull();
    }
  });

  it("refuses a name that escapes the directory it is resolved in", () => {
    expect(pathIn("/tmp/uploads", "../../etc/passwd")).toBeNull();
    // Percent-encoding is just characters in a file name, not a traversal.
    expect(pathIn("/tmp/uploads", "..%2f..%2f.env")).toBe("/tmp/uploads/..%2f..%2f.env");
  });
});

describe("what the bytes actually are", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const html = new TextEncoder().encode("<html><body><script>alert(1)</script>");

  it("recognises a real picture", () => {
    expect(matchesType("png", png)).toBe(true);
    expect(matchesType("jpg", jpeg)).toBe(true);
    expect(matchesType("gif", new TextEncoder().encode("GIF89a....."))).toBe(true);
  });

  it("refuses HTML stored under a picture's extension", () => {
    // Not what stops it being read as a document — that is the fixed content
    // type and nosniff — but the check that was simply missing: `accept` on a
    // file picker was the only content check there was.
    for (const ext of ["png", "jpg", "gif", "webp", "pdf", "mp4", "woff2"]) {
      expect(matchesType(ext, html), ext).toBe(false);
    }
  });

  it("does not pretend to judge SVG, which has its own sanitiser", () => {
    expect(matchesType("svg", new TextEncoder().encode("<svg/>"))).toBe(true);
  });

  it("has a content type for every extension it serves inline", () => {
    for (const ext of Object.keys(CONTENT_TYPES)) {
      expect(CONTENT_TYPES[ext]).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
    }
    expect(servesInline("png")).toBe(true);
    // A PDF or a font is a download, not a document this origin renders.
    expect(servesInline("pdf")).toBe(false);
    expect(servesInline("woff2")).toBe(false);
  });
});

describe("what the camera wrote in the margins", () => {
  /** A minimal JPEG: SOI, an APP1 carrying EXIF, a COM, then SOS. */
  function jpegWithExif(exifPayload: Uint8Array): Uint8Array {
    const app1Length = exifPayload.length + 2;
    const comment = new TextEncoder().encode("taken by someone");
    return new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, app1Length >> 8, app1Length & 0xff, ...exifPayload,
      0xff, 0xfe, (comment.length + 2) >> 8, (comment.length + 2) & 0xff, ...comment,
      0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, // a quantisation table, kept
      0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, // scan, kept
    ]);
  }

  /** "Exif\0\0" + a big-endian TIFF header with a GPS-looking payload. */
  const exif = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Something recognisable to assert on.
    0x47, 0x50, 0x53, 0x2d, 0x48, 0x45, 0x52, 0x45,
  ]);

  it("drops the EXIF block and the comment from a JPEG", () => {
    const stripped = stripImageMetadata(jpegWithExif(exif));
    const text = Buffer.from(stripped).toString("latin1");
    expect(text).not.toContain("GPS-HERE");
    expect(text).not.toContain("taken by someone");
    // The picture itself is untouched.
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
    expect(text).toContain("\xff\xda");
  });

  it("keeps the orientation, so a sideways photograph is not rotated", () => {
    // Orientation lives in the EXIF being dropped, so a minimal one carrying
    // only that tag is written back.
    const withOrientation = new Uint8Array([
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian, IFD at 8
      0x01, 0x00, // one entry
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    const stripped = stripImageMetadata(jpegWithExif(withOrientation));
    // APP1 is back, and carries the orientation value 6.
    expect(stripped[2]).toBe(0xff);
    expect(stripped[3]).toBe(0xe1);
    expect(Buffer.from(stripped).toString("latin1")).toContain("Exif");
    expect(stripped).toContain(6);
  });

  it("drops a PNG's text chunks and keeps its picture chunks", () => {
    const png = buildPng([
      ["IHDR", new Uint8Array(13)],
      ["tEXt", new TextEncoder().encode("Author\0Someone")],
      ["IDAT", new Uint8Array([1, 2, 3])],
      ["iTXt", new TextEncoder().encode("XML:com.adobe.xmp\0")],
      ["IEND", new Uint8Array(0)],
    ]);
    const text = Buffer.from(stripImageMetadata(png)).toString("latin1");
    expect(text).not.toContain("tEXt");
    expect(text).not.toContain("Someone");
    expect(text).toContain("IHDR");
    expect(text).toContain("IDAT");
    expect(text).toContain("IEND");
  });

  it("drops a WebP's EXIF chunk", () => {
    const webp = buildWebp([
      ["VP8 ", new Uint8Array([1, 2, 3, 4])],
      ["EXIF", new TextEncoder().encode("GPS-HERE")],
    ]);
    const text = Buffer.from(stripImageMetadata(webp)).toString("latin1");
    expect(text).not.toContain("GPS-HERE");
    expect(text).toContain("VP8 ");
    expect(text.startsWith("RIFF")).toBe(true);
  });

  it("leaves a format it cannot parse exactly as it was", () => {
    const other = new Uint8Array([1, 2, 3, 4, 5]);
    expect(stripImageMetadata(other)).toBe(other);
  });
});

function buildPng(chunks: [string, Uint8Array][]): Uint8Array {
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [type, data] of chunks) {
    const len = data.length;
    parts.push((len >> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255);
    parts.push(...[...type].map((c) => c.charCodeAt(0)));
    parts.push(...data);
    parts.push(0, 0, 0, 0); // CRC, not checked here
  }
  return new Uint8Array(parts);
}

function buildWebp(chunks: [string, Uint8Array][]): Uint8Array {
  const body: number[] = [];
  for (const [type, data] of chunks) {
    body.push(...[...type].map((c) => c.charCodeAt(0)));
    const len = data.length;
    body.push(len & 255, (len >> 8) & 255, (len >> 16) & 255, (len >> 24) & 255);
    body.push(...data);
    if (len % 2) body.push(0);
  }
  const size = body.length + 4;
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >> 24) & 255,
    0x57, 0x45, 0x42, 0x50,
    ...body,
  ]);
}
