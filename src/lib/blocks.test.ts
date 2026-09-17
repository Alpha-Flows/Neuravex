import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { BLOCKS, getBlockDefinition } from "@/lib/blocks";
import { TEMPLATES } from "@/lib/templates";

/** Every string anywhere in a block tree, so nothing hides in a nested prop. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const REMOTE = /^(https?:)?\/\//i;

describe("block defaults", () => {
  it("has a definition for every block the palette offers", () => {
    for (const b of BLOCKS) expect(getBlockDefinition(b.type)).toBe(b);
  });

  it("ships no block that loads something off the machine", () => {
    // Neuravex runs locally and its sites are downloaded as files. A default
    // pointing at Unsplash or a demo clip on w3schools.com is a broken image
    // offline and someone else's uptime online.
    for (const b of BLOCKS) {
      const remote = strings(b.defaultProps).filter((s) => REMOTE.test(s));
      expect(remote, `${b.type} default props`).toEqual([]);
    }
  });

  it("points the image block at a picture that is actually bundled", () => {
    const src = getBlockDefinition("image")!.defaultProps.src as string;
    expect(src.startsWith("/stock/")).toBe(true);
    expect(existsSync(join(process.cwd(), "public", src))).toBe(true);
  });

  it("starts the video block empty rather than with someone else's video", () => {
    expect(getBlockDefinition("video")!.defaultProps.src).toBe("");
  });
});

describe("templates", () => {
  it("seed pages that work with no internet connection", () => {
    const offenders: string[] = [];
    for (const t of TEMPLATES) {
      for (const s of strings(t.pages)) if (REMOTE.test(s)) offenders.push(`${t.id}: ${s}`);
    }
    expect(offenders).toEqual([]);
  });

  it("only reference images that exist in public/", () => {
    const missing: string[] = [];
    for (const t of TEMPLATES) {
      for (const s of strings(t.pages)) {
        if (!s.startsWith("/stock/") && !s.startsWith("/uploads/")) continue;
        if (!existsSync(join(process.cwd(), "public", s))) missing.push(`${t.id}: ${s}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
