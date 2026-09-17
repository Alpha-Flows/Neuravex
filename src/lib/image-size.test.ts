import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { imageSize } from "@/lib/image-size";

const STOCK = join(process.cwd(), "public", "stock");

function everyStockPhoto(): string[] {
  const out: string[] = [];
  for (const category of readdirSync(STOCK)) {
    const dir = join(STOCK, category);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) out.push(join(dir, file));
  }
  return out;
}

describe("imageSize", () => {
  it("reads every photo Neuravex ships", () => {
    const photos = everyStockPhoto();
    expect(photos.length).toBeGreaterThan(50);

    const unreadable = photos.filter((p) => imageSize(readFileSync(p)) === null);
    expect(unreadable).toEqual([]);

    // And the numbers are real, not a misread header.
    for (const p of photos.slice(0, 5)) {
      const size = imageSize(readFileSync(p))!;
      expect(size.width, p).toBeGreaterThan(200);
      expect(size.height, p).toBeGreaterThan(200);
    }
  });

  it("reads a PNG", () => {
    // 1x1 PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    expect(imageSize(png)).toEqual({ width: 1, height: 1 });
  });

  it("reads a GIF", () => {
    const gif = Buffer.from("R0lGODdhCgAFAIAAAAAAAP///ywAAAAACgAFAAACB4SPqcvtDwUAOw==", "base64");
    expect(imageSize(gif)).toEqual({ width: 10, height: 5 });
  });

  it("refuses what it cannot read rather than guessing", () => {
    expect(imageSize(Buffer.from("not an image at all"))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
    // A JPEG header with nothing behind it.
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    // A PNG that claims a zero dimension.
    const broken = Buffer.alloc(24);
    broken.writeUInt32BE(0x89504e47, 0);
    broken.write("IHDR", 12, "ascii");
    broken.writeUInt32BE(0, 16);
    broken.writeUInt32BE(10, 20);
    expect(imageSize(broken)).toBeNull();
  });
});
