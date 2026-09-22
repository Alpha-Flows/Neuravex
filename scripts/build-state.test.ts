import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync } from "fs";
import { SKIP, sourceFingerprint, decide } from "./build-state.js";

/**
 * The launcher decides from this whether to serve the bundle it has. Getting
 * it wrong in one direction costs a needless build; getting it wrong in the
 * other serves last month's code against a database that was migrated
 * moments earlier, which is the failure the whole file exists to prevent.
 */

const ROOT = process.cwd();
const launcher = readFileSync(join(ROOT, "electron", "server.js"), "utf8");
const build = readFileSync(join(ROOT, "scripts", "build.js"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/** A tree with one file in it, so a test can move one thing at a time. */
let dir: string;
const roots = ["src", "package.json"];

function fingerprint() {
  return sourceFingerprint(roots, dir).fingerprint;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "neuravex-build-state-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "page.tsx"), "export default function Page() {}\n");
  writeFileSync(join(dir, "package.json"), '{ "name": "x" }\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the source fingerprint", () => {
  it("is the same for a tree that has not moved", () => {
    expect(fingerprint()).toBe(fingerprint());
  });

  it("moves when a file's contents are edited", () => {
    const before = fingerprint();
    writeFileSync(join(dir, "src", "page.tsx"), "export default function Page() { return null; }\n");
    expect(fingerprint()).not.toBe(before);
  });

  it("moves when a file is only touched", () => {
    // Deliberate: this is the direction it is allowed to be wrong in. A
    // touched-but-unchanged file costs one needless build, which is visible
    // and harmless. Missing an edit is neither.
    const before = fingerprint();
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(dir, "src", "page.tsx"), later, later);
    expect(fingerprint()).not.toBe(before);
  });

  it("moves when a file is added, and when one is removed", () => {
    const before = fingerprint();
    writeFileSync(join(dir, "src", "extra.tsx"), "export const x = 1;\n");
    const added = fingerprint();
    expect(added).not.toBe(before);

    rmSync(join(dir, "src", "extra.tsx"));
    expect(fingerprint()).toBe(before);
  });

  it("does not move for anything under node_modules or .next", () => {
    // This is what makes it cheap enough to run on every launch: those two
    // hold hundreds of thousands of files and say nothing about the source
    // that package-lock.json does not.
    const before = fingerprint();
    for (const skipped of ["node_modules", ".next"]) {
      mkdirSync(join(dir, "src", skipped), { recursive: true });
      writeFileSync(join(dir, "src", skipped, "junk.js"), "whatever\n");
    }
    expect(fingerprint()).toBe(before);
  });

  it("skips the directories that hold a customer's data", () => {
    // A site saved while the app runs must not make the next launch rebuild.
    expect(SKIP.has("data")).toBe(true);
    expect(SKIP.has("backups")).toBe(true);
  });

  it("reports when the source last moved", () => {
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(dir, "src", "page.tsx"), later, later);
    const { newestMs } = sourceFingerprint(roots, dir);
    expect(Math.round(newestMs)).toBe(Math.round(later.getTime()));
  });

  it("survives a source that is not there at all", () => {
    expect(() => sourceFingerprint(["does-not-exist"], dir)).not.toThrow();
  });
});

describe("deciding whether to build", () => {
  const f = "abc";

  it("builds when there is no bundle", () => {
    expect(decide({ hasBuild: false, recorded: f, fingerprint: f, buildMs: 0, newestMs: 0 })).toMatchObject({
      current: false,
      reason: "no build",
    });
  });

  it("skips when the recorded fingerprint still matches", () => {
    expect(decide({ hasBuild: true, recorded: f, fingerprint: f, buildMs: 9, newestMs: 1 })).toMatchObject({
      current: true,
    });
  });

  it("builds when it does not — whichever way the source moved", () => {
    // `git pull` and `git checkout` of an older revision both land here.
    expect(decide({ hasBuild: true, recorded: "old", fingerprint: f, buildMs: 9, newestMs: 1 })).toMatchObject({
      current: false,
      reason: "source changed",
    });
  });

  it("trusts a bundle newer than every source file when nothing was recorded", () => {
    // The install that predates this file: rebuilding unconditionally would
    // cost every existing user a multi-minute build on their first launch
    // after updating, for a bundle that is demonstrably up to date.
    expect(decide({ hasBuild: true, recorded: undefined, fingerprint: f, buildMs: 500, newestMs: 100 })).toMatchObject({
      current: true,
    });
  });

  it("rebuilds an unrecorded bundle that is older than the source", () => {
    // Same install, one `git pull` later. This is the original bug.
    expect(decide({ hasBuild: true, recorded: undefined, fingerprint: f, buildMs: 100, newestMs: 500 })).toMatchObject({
      current: false,
      reason: "build of unknown age",
    });
  });
});

describe("how the launcher and the build script use it", () => {
  it("is what `npm run build` runs, so a hand build counts", () => {
    // Otherwise `npm run build && npm run desktop` — the documented flow —
    // would build twice.
    expect(pkg.scripts.build).toBe("node scripts/build.js");
    expect(build).toContain("recordBuild()");
  });

  it("records only after the build succeeded", () => {
    const built = build.indexOf('runBin("next", ["build"])');
    const recorded = build.indexOf("recordBuild()");
    expect(built).toBeGreaterThan(-1);
    expect(recorded).toBeGreaterThan(built);
  });

  it("no longer decides on whether .next merely exists", () => {
    expect(launcher).not.toContain('fs.existsSync(path.join(ROOT, ".next"))');
    expect(launcher).toContain("buildIsCurrent()");
  });

  it("still checks the build after the database, and inside main()", () => {
    // firstRun() migrates the schema. A stale bundle against a migrated
    // database is the pairing this all exists to prevent, so the order is
    // load-bearing rather than incidental.
    const main = launcher.slice(launcher.indexOf("async function main()"));
    expect(main.indexOf("firstRun()")).toBeLessThan(main.indexOf("ensureBuilt()"));
  });

  it("stops rather than serving the old bundle when the build fails", () => {
    expect(launcher).toContain("Could not build. Run `npm run build` to see what it needs.");
    expect(launcher).toContain("process.exit(1)");
  });
});
