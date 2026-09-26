/**
 * Reading a zip, a file at a time, in the browser.
 *
 * A backup can hold a site's videos, so it is never read whole: the directory
 * at the end of the file is read first, and then each file is cut out of the
 * zip with `Blob.slice` and, when it was compressed, inflated through the
 * browser's own `DecompressionStream`. Nothing is installed for it. It reads
 * what `lib/zip.ts` writes — stored and deflated entries in a plain zip — and
 * says so rather than guessing at anything else.
 */

export interface UnzipEntry {
  path: string;
  /** 0 stored, 8 deflated. */
  method: number;
  compressedSize: number;
  size: number;
  /** Where the entry's local header starts. */
  offset: number;
}

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

/** Every file in the zip, from its central directory; throws on anything that is not a zip this reads. */
export async function listZip(blob: Blob): Promise<UnzipEntry[]> {
  // The end record is 22 bytes, after at most a 64 KB comment.
  const tailStart = Math.max(0, blob.size - (22 + 0xffff));
  const tail = await bytes(blob, tailStart, blob.size);
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("That file is not a zip.");
  const count = tail.getUint16(end + 10, true);
  const dirSize = tail.getUint32(end + 12, true);
  const dirOffset = tail.getUint32(end + 16, true);
  if (dirOffset === 0xffffffff || count === 0xffff) throw new Error("That zip is larger than this can read.");

  const dir = await bytes(blob, dirOffset, dirOffset + dirSize);
  const decoder = new TextDecoder();
  const entries: UnzipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== 0x02014b50) throw new Error("That zip's directory is damaged.");
    const method = dir.getUint16(p + 10, true);
    const compressedSize = dir.getUint32(p + 20, true);
    const size = dir.getUint32(p + 24, true);
    const nameLength = dir.getUint16(p + 28, true);
    const extraLength = dir.getUint16(p + 30, true);
    const commentLength = dir.getUint16(p + 32, true);
    const offset = dir.getUint32(p + 42, true);
    const path = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength));
    entries.push({ path, method, compressedSize, size, offset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One file out of the zip, as a Blob of its own contents. */
export async function readZipEntry(blob: Blob, entry: UnzipEntry): Promise<Blob> {
  const local = await bytes(blob, entry.offset, entry.offset + 30);
  if (local.getUint32(0, true) !== 0x04034b50) throw new Error(`${entry.path} is damaged in that zip.`);
  const start = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const body = blob.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return body;
  if (entry.method !== 8) throw new Error(`${entry.path} is compressed in a way this cannot read.`);
  const inflated = body.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(inflated).blob();
}
