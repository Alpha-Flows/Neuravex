import { describe, it, expect, afterAll } from "vitest";
import { inflateRawSync } from "zlib";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createZip, crc32, zipStream, MAX_ZIP_BYTES } from "@/lib/zip";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

/** Read the archive back the way an unzip tool does: from the central directory. */
function readZip(zip: Buffer): { path: string; data: Buffer }[] {
  const endOffset = zip.length - 22;
  expect(zip.readUInt32LE(endOffset)).toBe(END_OF_CENTRAL);
  const count = zip.readUInt16LE(endOffset + 10);
  let pointer = zip.readUInt32LE(endOffset + 16);

  const out: { path: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(pointer)).toBe(CENTRAL_HEADER);
    const method = zip.readUInt16LE(pointer + 10);
    const crc = zip.readUInt32LE(pointer + 16);
    const compressedSize = zip.readUInt32LE(pointer + 20);
    const uncompressedSize = zip.readUInt32LE(pointer + 24);
    const nameLength = zip.readUInt16LE(pointer + 28);
    const localOffset = zip.readUInt32LE(pointer + 42);
    const path = zip.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");

    expect(zip.readUInt32LE(localOffset)).toBe(LOCAL_HEADER);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const extraLength = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + extraLength;
    const body = zip.subarray(start, start + compressedSize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);

    expect(data).toHaveLength(uncompressedSize);
    expect(crc32(data)).toBe(crc);
    out.push({ path, data });
    pointer += 46 + nameLength;
  }
  return out;
}

describe("crc32", () => {
  it("matches the known checksum for a standard input", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for empty input", () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe("createZip", () => {
  it("round-trips text, nested paths and binary data", () => {
    const binary = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
    const entries = [
      { path: "index.html", data: Buffer.from("<h1>Hello</h1>".repeat(100)) },
      { path: "assets/site.css", data: Buffer.from("body{color:red}") },
      { path: "uploads/pic.bin", data: binary },
    ];

    const read = readZip(createZip(entries));
    expect(read.map((e) => e.path)).toEqual(["index.html", "assets/site.css", "uploads/pic.bin"]);
    expect(read[0].data.toString()).toBe("<h1>Hello</h1>".repeat(100));
    expect(read[2].data.equals(binary)).toBe(true);
  });

  it("keeps non-ASCII file names and contents intact", () => {
    const read = readZip(createZip([{ path: "über/café.txt", data: Buffer.from("héllo ✓", "utf8") }]));
    expect(read[0].path).toBe("über/café.txt");
    expect(read[0].data.toString("utf8")).toBe("héllo ✓");
  });

  it("compresses what compresses and stores what does not", () => {
    const compressible = Buffer.from("a".repeat(5000));
    const zip = createZip([{ path: "a.txt", data: compressible }]);
    expect(zip.length).toBeLessThan(compressible.length / 2);
  });

  it("writes a valid empty archive", () => {
    const zip = createZip([]);
    expect(zip).toHaveLength(22);
    expect(zip.readUInt32LE(0)).toBe(END_OF_CENTRAL);
    expect(readZip(zip)).toEqual([]);
  });

  it("handles an empty file", () => {
    const read = readZip(createZip([{ path: "empty.txt", data: Buffer.alloc(0) }]));
    expect(read[0].data).toHaveLength(0);
  });
});

describe("an archive sent as it is made", () => {
  const dir = mkdtempSync(join(tmpdir(), "nvx-zip-"));
  const video = Buffer.alloc(3 * 1024 * 1024 + 17, 0);
  for (let i = 0; i < video.length; i += 4096) video[i] = i % 251;
  writeFileSync(join(dir, "clip.mp4"), video);
  writeFileSync(join(dir, "empty.txt"), "");
  const read = async (stream: ReadableStream<Uint8Array>) => Buffer.from(await new Response(stream).arrayBuffer());
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("holds the same files as one made in memory, and says its length first", async () => {
    const html = Buffer.from("<h1>Hello</h1>".repeat(200));
    const made = zipStream([
      { path: "index.html", data: html },
      { path: "uploads/clip.mp4", file: join(dir, "clip.mp4"), size: video.length },
      { path: "uploads/empty.txt", file: join(dir, "empty.txt"), size: 0 },
    ]);
    if (!made) throw new Error("refused");
    const zip = await read(made.stream);
    expect(zip.length).toBe(made.length);
    const files = readZip(zip);
    expect(files.map((f) => f.path)).toEqual(["index.html", "uploads/clip.mp4", "uploads/empty.txt"]);
    expect(files[0].data.equals(html)).toBe(true);
    expect(files[1].data.equals(video)).toBe(true);
    expect(files[2].data).toHaveLength(0);
  });

  it("stores a file from disk as it is, rather than deflating it", async () => {
    const made = zipStream([{ path: "clip.mp4", file: join(dir, "clip.mp4"), size: video.length }]);
    const zip = await read(made!.stream);
    const central = zip.readUInt32LE(zip.length - 22 + 16);
    expect(zip.readUInt16LE(central + 10)).toBe(0);
  });

  it("refuses to read a file through a link", async () => {
    symlinkSync(join(dir, "clip.mp4"), join(dir, "link.mp4"));
    const made = zipStream([{ path: "link.mp4", file: join(dir, "link.mp4"), size: video.length }]);
    await expect(read(made!.stream)).rejects.toThrow();
  });

  it("stops rather than send offsets that no longer add up", async () => {
    const made = zipStream([{ path: "clip.mp4", file: join(dir, "clip.mp4"), size: video.length + 10 }]);
    await expect(read(made!.stream)).rejects.toThrow();
  });

  it("is refused before a byte is read when it would not fit a plain ZIP", () => {
    expect(zipStream([{ path: "huge.mp4", file: join(dir, "missing.mp4"), size: MAX_ZIP_BYTES }])).toBeNull();
  });

});

