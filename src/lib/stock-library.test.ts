import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const PUBLIC_DIR = join(process.cwd(), "public");
const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, "stock", "manifest.json"), "utf8")) as {
  photos: { id: string; file: string; alt: string; credit?: string; category: string }[];
};

describe("the pictures that ship with Neuravex", () => {
  it("says what each one shows, not who took it", () => {
    // Every entry used to read "<Category> background photo by <Name>" — a
    // credit line standing in for a description. A picture chosen from the
    // library carries its alt text onto the page, so that is what a screen
    // reader would have read out for the photograph.
    for (const photo of manifest.photos) {
      expect(photo.alt.trim().length, photo.file).toBeGreaterThan(0);
      expect(photo.alt, photo.file).not.toMatch(/photo by/i);
      if (photo.credit) expect(photo.alt, photo.file).not.toContain(photo.credit);
    }
  });

  it("is a library of files that are actually there", () => {
    const missing = manifest.photos
      .map((p) => p.file)
      .filter((file) => !existsSync(join(PUBLIC_DIR, "stock", file)));
    expect(missing).toEqual([]);
  });

  it("describes a picture the same way wherever it is used", () => {
    // The templates describe the 29 photographs they use. A picture is one
    // picture: the library has to say the same thing about it.
    const templates = readFileSync(join(process.cwd(), "src", "lib", "templates.ts"), "utf8");
    const inTemplates = new Map<string, string>();
    for (const m of templates.matchAll(/\{\s*src:\s*"\/stock\/([^"]+)",\s*alt:\s*"([^"]*)"/g)) {
      inTemplates.set(m[1], m[2]);
    }
    expect(inTemplates.size).toBeGreaterThan(0);

    for (const photo of manifest.photos) {
      const described = inTemplates.get(photo.file);
      if (described) expect(photo.alt, photo.file).toBe(described);
    }
  });

  it("hands a chosen picture's description to the page", () => {
    // The picker knew the description and kept it: onSelect passed a size and
    // nothing else, so an image block landed with alt="".
    const picker = readFileSync(join(process.cwd(), "src", "components", "editor", "MediaPicker.tsx"), "utf8");
    expect(picker).toContain("onSelect(p.url, { ...size, alt: p.alt })");

    const image = readFileSync(join(process.cwd(), "src", "components", "blocks", "Image.tsx"), "utf8");
    // Words already written by hand win over the library's; a description
    // borrowed from the library goes with the picture it described.
    expect(image).toContain("props.alt?.trim() && !props.altFromLibrary");
    expect(image).toContain("{ alt: size?.alt ?? \"\", altFromLibrary: !!size?.alt }");
  });
});
