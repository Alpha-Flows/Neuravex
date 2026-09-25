import { constants } from "fs";
import { open, type FileHandle } from "fs/promises";
import { deflateRawSync } from "zlib";

/**
 * A tiny ZIP writer, enough to hand someone their site as a single download.
 *
 * Writes a standard (non-Zip64) archive with deflate compression, which every
 * OS unpacks natively. Kept in-repo rather than pulled from npm because the
 * format needed here is small and fully specified, and this project's whole
 * pitch is that it runs on your machine with nothing else involved.
 */

export interface ZipEntry {
  /** Path inside the archive, using forward slashes. */
  path: string;
  data: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

/** The checksum carried on so far, one more piece of the file taken in. */
function crcUpdate(state: number, buf: Uint8Array): number {
  let c = state;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c;
}

export function crc32(buf: Buffer): number {
  return (crcUpdate(0xffffffff, buf) ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, the only timestamp a basic ZIP entry carries. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

/** What both headers of one entry say about it. */
interface EntryFacts {
  name: Buffer;
  method: 0 | 8;
  crc: number;
  /** As stored in the archive. */
  bodySize: number;
  /** As it comes out again. */
  size: number;
}

function localHeader(facts: EntryFacts, stamp: { time: number; date: number }): Buffer {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
  local.writeUInt16LE(facts.method, 8);
  local.writeUInt16LE(stamp.time, 10);
  local.writeUInt16LE(stamp.date, 12);
  local.writeUInt32LE(facts.crc, 14);
  local.writeUInt32LE(facts.bodySize, 18);
  local.writeUInt32LE(facts.size, 22);
  local.writeUInt16LE(facts.name.length, 26);
  local.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([local, facts.name]);
}

function centralHeader(facts: EntryFacts, stamp: { time: number; date: number }, offset: number): Buffer {
  const dirEntry = Buffer.alloc(46);
  dirEntry.writeUInt32LE(0x02014b50, 0); // central directory signature
  dirEntry.writeUInt16LE(20, 4); // version made by
  dirEntry.writeUInt16LE(20, 6); // version needed
  dirEntry.writeUInt16LE(0x0800, 8);
  dirEntry.writeUInt16LE(facts.method, 10);
  dirEntry.writeUInt16LE(stamp.time, 12);
  dirEntry.writeUInt16LE(stamp.date, 14);
  dirEntry.writeUInt32LE(facts.crc, 16);
  dirEntry.writeUInt32LE(facts.bodySize, 20);
  dirEntry.writeUInt32LE(facts.size, 24);
  dirEntry.writeUInt16LE(facts.name.length, 28);
  dirEntry.writeUInt16LE(0, 30); // extra
  dirEntry.writeUInt16LE(0, 32); // comment
  dirEntry.writeUInt16LE(0, 34); // disk number
  dirEntry.writeUInt16LE(0, 36); // internal attributes
  dirEntry.writeUInt32LE(0, 38); // external attributes
  dirEntry.writeUInt32LE(offset, 42);
  return Buffer.concat([dirEntry, facts.name]);
}

function endRecord(count: number, centralSize: number, centralOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20); // comment length
  return end;
}

/** An entry held in memory, deflated when that makes it smaller. */
function inMemory(entry: ZipEntry): EntryFacts & { body: Buffer } {
  const deflated = deflateRawSync(entry.data);
  // Storing is smaller than deflating for data that will not compress.
  const useDeflate = deflated.length < entry.data.length;
  const body = useDeflate ? deflated : entry.data;
  return {
    name: Buffer.from(entry.path, "utf8"),
    method: useDeflate ? 8 : 0,
    crc: crc32(entry.data),
    bodySize: body.length,
    size: entry.data.length,
    body,
  };
}

export function createZip(entries: ZipEntry[], now: Date = new Date()): Buffer {
  const stamp = dosDateTime(now);
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const facts = inMemory(entry);
    const local = localHeader(facts, stamp);
    locals.push(local, facts.body);
    central.push(centralHeader(facts, stamp, offset));
    offset += local.length + facts.body.length;
  }

  const centralBuf = Buffer.concat(central);
  return Buffer.concat([...locals, centralBuf, endRecord(entries.length, centralBuf.length, offset)]);
}

/** A file on disk, read as the archive is sent rather than held. */
export interface ZipFileEntry {
  /** Path inside the archive, using forward slashes. */
  path: string;
  /** Where it is on disk. */
  file: string;
  /** Its size when it was looked at, which is what the headers promise. */
  size: number;
}

/**
 * The most a plain ZIP can hold. Every size and offset in it is four bytes,
 * and an archive past this needs the Zip64 extension, which this does not
 * write.
 */
export const MAX_ZIP_BYTES = 0xffffffff;
const MAX_ZIP_ENTRIES = 0xffff;

/**
 * An archive sent as it is made, and its length, or null when it would be
 * larger than a plain ZIP can hold.
 *
 * `createZip` holds everything at once, which was fine while an upload was
 * 10 MB at most. With a video allowed to be 250 MB, a site with two of them
 * held them, their deflated copies and the finished archive in memory at the
 * same time — well over a gigabyte for one download — and the server stopped
 * answering the editor for the seconds the deflating took, since it ran on the
 * one thread there is. A file on disk is read here twice instead, once for its
 * checksum and once to send it, a piece at a time, and stored as it is:
 * pictures, sounds and video are compressed already, and deflating them bought
 * nothing but the wait. What is in memory — the pages, the stylesheet — is
 * still deflated, exactly as before.
 *
 * Every size is known before the first byte goes out, so the download still
 * says how large it is and a browser can show how far it has got.
 */
export function zipStream(
  entries: (ZipEntry | ZipFileEntry)[],
  now: Date = new Date(),
): { length: number; stream: ReadableStream<Uint8Array> } | null {
  const stamp = dosDateTime(now);
  const planned = entries.map((entry) =>
    "data" in entry
      ? { kind: "memory" as const, ...inMemory(entry) }
      : { kind: "file" as const, name: Buffer.from(entry.path, "utf8"), file: entry.file, size: entry.size },
  );

  let length = 22;
  for (const entry of planned) {
    const bodySize = entry.kind === "memory" ? entry.bodySize : entry.size;
    length += 30 + entry.name.length + bodySize + 46 + entry.name.length;
  }
  if (length > MAX_ZIP_BYTES || planned.length > MAX_ZIP_ENTRIES) return null;

  async function* parts(): AsyncGenerator<Uint8Array> {
    const central: Buffer[] = [];
    let offset = 0;
    for (const entry of planned) {
      let facts: EntryFacts;
      if (entry.kind === "memory") {
        facts = entry;
        const local = localHeader(facts, stamp);
        yield local;
        yield entry.body;
        central.push(centralHeader(facts, stamp, offset));
        offset += local.length + entry.body.length;
        continue;
      }

      // Opened once, without following a link, and read twice through the
      // same handle, so the checksum is of the bytes that are sent.
      // `turbopackIgnore`: a customer's upload, found at request time, not a
      // module Turbopack should trace the whole project to find.
      const handle = await open(/*turbopackIgnore: true*/ entry.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        facts = { name: entry.name, method: 0, crc: await checksum(handle, entry.size), bodySize: entry.size, size: entry.size };
        const local = localHeader(facts, stamp);
        yield local;
        let sent = 0;
        if (entry.size > 0) {
          for await (const chunk of handle.createReadStream({ start: 0, end: entry.size - 1, autoClose: false })) {
            sent += (chunk as Buffer).length;
            yield chunk as Buffer;
          }
        }
        // A file that shrank since it was measured would leave every offset
        // after it pointing into the wrong place; better no archive than that.
        if (sent !== entry.size) throw new Error(`${entry.name.toString("utf8")} changed while it was being added`);
        central.push(centralHeader(facts, stamp, offset));
        offset += local.length + entry.size;
      } finally {
        await handle.close().catch(() => {});
      }
    }
    const centralBuf = Buffer.concat(central);
    yield centralBuf;
    yield endRecord(planned.length, centralBuf.length, offset);
  }

  const source = parts();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await source.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    // A download the browser gave up on closes the file it was reading.
    async cancel() {
      await source.return(undefined);
    },
  });
  return { length, stream };
}

/** The CRC-32 of the first `size` bytes behind a handle, read a piece at a time. */
async function checksum(handle: FileHandle, size: number): Promise<number> {
  const piece = Buffer.alloc(1024 * 1024);
  let state = 0xffffffff;
  for (let position = 0; position < size; ) {
    const { bytesRead } = await handle.read(piece, 0, Math.min(piece.length, size - position), position);
    if (bytesRead === 0) throw new Error("the file ended early");
    state = crcUpdate(state, piece.subarray(0, bytesRead));
    position += bytesRead;
  }
  return (state ^ 0xffffffff) >>> 0;
}
