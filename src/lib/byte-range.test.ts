import { describe, it, expect } from "vitest";
import { parseByteRange } from "@/lib/byte-range";

describe("the part of an empty file somebody asks for", () => {
  it("is the whole of it, never a range that ends before it starts", () => {
    expect(parseByteRange("bytes=-500", 0)).toBeNull();
    expect(parseByteRange("bytes=0-", 0)).toBe("unsatisfiable");
  });
});

describe("any range the parser hands back", () => {
  it("lies inside the file", () => {
    const headers = ["bytes=0-", "bytes=0-0", "bytes=5-2", "bytes=-1", "bytes=-9999", "bytes=3-9999", "bytes=9-9", "bytes=10-", "bytes=0-1,4-5", "bytes=abc", "items=0-1"];
    for (const size of [0, 1, 2, 10, 1000]) {
      for (const header of headers) {
        const range = parseByteRange(header, size);
        if (range && range !== "unsatisfiable") {
          expect(range.start, `${header} of ${size}`).toBeGreaterThanOrEqual(0);
          expect(range.end, `${header} of ${size}`).toBeLessThan(size);
          expect(range.start, `${header} of ${size}`).toBeLessThanOrEqual(range.end);
        }
      }
    }
  });
});
