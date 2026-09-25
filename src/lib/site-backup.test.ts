import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { createZip } from "@/lib/zip";
import { listZip, readZipEntry } from "@/lib/unzip";
import { moveUploads, readBackupMedia } from "@/lib/site-backup";

describe("a backup", () => {
  it("is read back a file at a time, stored or deflated", async () => {
    const picture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const zip = createZip([
      { path: "site.json", data: Buffer.from('{"site":{"name":"Acme"}}'.repeat(50), "utf8") },
      { path: "uploads/a.png", data: picture },
    ]);
    const blob = new Blob([new Uint8Array(zip)]);
    const entries = await listZip(blob);
    expect(entries.map((e) => e.path)).toEqual(["site.json", "uploads/a.png"]);
    expect(await (await readZipEntry(blob, entries[0])).text()).toBe('{"site":{"name":"Acme"}}'.repeat(50));
    expect(Buffer.from(await (await readZipEntry(blob, entries[1])).arrayBuffer())).toEqual(picture);
  });

  it("is told apart from a file that is not a zip", async () => {
    await expect(listZip(new Blob(["just some text"]))).rejects.toThrow("not a zip");
  });

  it("keeps only what its media list may say", () => {
    expect(
      readBackupMedia([
        { path: "uploads/a.webp", name: "Shop", alt: "The shop front", variantOf: null },
        { path: "uploads/a-480.webp", name: "", alt: "", variantOf: "uploads/a.webp" },
        { path: "uploads/b.webp", variantOf: "uploads/gone.webp" },
        { path: "../../.env", name: "secrets" },
        "nonsense",
      ]),
    ).toEqual([
      { path: "uploads/a.webp", name: "Shop", alt: "The shop front", variantOf: null },
      { path: "uploads/a-480.webp", name: "", alt: "", variantOf: "uploads/a.webp" },
      { path: "uploads/b.webp", name: "", alt: "", variantOf: null },
    ]);
  });

  it("moves every address it brought back, and leaves the rest", () => {
    const json = JSON.stringify({ a: "/uploads/old.webp", b: 'url("/uploads/old.webp")', c: "/uploads/other.png" });
    const moved = moveUploads(json, new Map([["/uploads/old.webp", "/uploads/new.webp"]]));
    expect(JSON.parse(moved)).toEqual({ a: "/uploads/new.webp", b: 'url("/uploads/new.webp")', c: "/uploads/other.png" });
  });

  it("is brought back through the upload route, and its archive through the import route", () => {
    const client = readFileSync("src/lib/site-import.ts", "utf8");
    expect(client).toContain("await sendUpload(");
    expect(client).toContain('fetch("/api/sites/import"');
    const route = readFileSync("src/app/api/sites/import/route.ts", "utf8");
    expect(route).toContain("createSiteFromArchive(body, {");
  });
});

describe("zod", () => {
  it("is imported through the module that stops it probing for eval in the browser", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name)) files.push(full);
      }
    };
    walk("src");
    const direct = files.filter((f) => f !== join("src", "lib", "zod.ts") && /^import\b[^;]*\bfrom ["']zod["'];?$/m.test(readFileSync(f, "utf8")));
    expect(direct).toEqual([]);
    expect(readFileSync("src/lib/zod.ts", "utf8")).toContain('if (typeof window !== "undefined") z.config({ jitless: true });');
  });
});
