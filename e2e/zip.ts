import { inflateRawSync } from "zlib";

/**
 * One file out of a zip, read the way an unzip tool reads it.
 *
 * Shared, because a test that only looked for file names in the archive's
 * directory said nothing about what was in the page: the blocks' own download
 * test was called "carry no script" and never opened `index.html` to see.
 */
export function readFromZip(zip: Buffer, wanted: string): string | null {
  const end = zip.length - 22;
  const count = zip.readUInt16LE(end + 10);
  let pointer = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(pointer + 10);
    const compressedSize = zip.readUInt32LE(pointer + 20);
    const nameLength = zip.readUInt16LE(pointer + 28);
    const localOffset = zip.readUInt32LE(pointer + 42);
    const path = zip.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    if (path === wanted) {
      const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const body = zip.subarray(start, start + compressedSize);
      return (method === 8 ? inflateRawSync(body) : Buffer.from(body)).toString("utf8");
    }
    pointer += 46 + nameLength;
  }
  return null;
}
