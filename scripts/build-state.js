#!/usr/bin/env node

/**
 * Whether the bundle in `.next` was built from the source on disk.
 *
 * `fs.existsSync(".next")` was the whole of the old test, so `git pull &&
 * npm run desktop` started last month's bundle — and started it against a
 * database `firstRun()` had just migrated to the new schema. That pairing is
 * the one combination nothing else in the app is written to survive: the
 * server is serving code that does not know about a column the database now
 * has, or expects one it no longer has. `INSTALL.md` promised a rebuild the
 * whole time.
 *
 * The check is a fingerprint of the source, recorded beside the schema
 * fingerprint that `first-run.js` already keeps in
 * `prisma/.neuravex-state.json`, and compared on the way up.
 *
 * It is a walk of `(path, size, mtime)` rather than a hash of the contents.
 * `public/` is 53 MB against `src/`'s 1.5 MB — almost all of it the bundled
 * photographs, which never change — and reading 53 MB on every launch is a
 * visible pause on a program whose entire budget is "the browser opens". The
 * walk reads no file bodies at all.
 *
 * The two ways it can be wrong are not equally bad, and it errs toward the
 * harmless one. A file touched without being changed costs one unnecessary
 * build: slow, correct, and obvious. What it cannot do is miss an edit,
 * because an edit always moves `mtime`. Checking out an *older* revision
 * rebuilds too, since mtime moves then as well.
 *
 * Not git HEAD: an install from a tarball has no `.git`, a dirty working tree
 * does not move HEAD, and neither case is unusual for the people this
 * launcher is for.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/** Everything `next build` reads. Anything outside this cannot change the bundle. */
const SOURCES = [
  "src",
  "public",
  "prisma/schema.prisma",
  "next.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
];

/**
 * Directories the walk never descends into.
 *
 * `node_modules` and `.next` are the reason this is affordable: they hold
 * hundreds of thousands of files between them, and neither says anything
 * about whether the source has moved that `package-lock.json` does not.
 */
const SKIP = new Set(["node_modules", ".next", ".git", "data", "backups", "test-results", "playwright-report"]);

/** Every file under `entry`, as `path\0size\0mtime` lines, and the newest mtime seen. */
function walk(root, entry, lines, newest) {
  const absolute = path.join(root, entry);
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    // A source that is not there is a fact about the tree like any other, and
    // its absence changes the fingerprint by leaving a line out.
    return newest;
  }

  if (stat.isDirectory()) {
    let names;
    try {
      names = fs.readdirSync(absolute).sort();
    } catch {
      return newest;
    }
    for (const name of names) {
      if (SKIP.has(name)) continue;
      newest = walk(root, path.join(entry, name), lines, newest);
    }
    return newest;
  }

  // Posix separators, so a fingerprint means the same thing on Windows.
  lines.push(`${entry.split(path.sep).join("/")}\0${stat.size}\0${stat.mtimeMs}`);
  return Math.max(newest, stat.mtimeMs);
}

/** What the source looks like, and when any of it last moved. */
function sourceFingerprint(roots = SOURCES, root = ROOT) {
  const lines = [];
  let newestMs = 0;
  for (const entry of roots) newestMs = walk(root, entry, lines, newestMs);
  lines.sort();
  return {
    fingerprint: crypto.createHash("sha256").update(lines.join("\n")).digest("hex"),
    newestMs,
  };
}

/**
 * The decision itself, as a function of what was found — so every branch can
 * be tested without a filesystem.
 *
 * The interesting case is the last one. An install that predates this file has
 * a `.next` of unknown provenance and nothing recorded about it. Rebuilding
 * unconditionally would cost every existing user a multi-minute build on the
 * first launch after an update, and trusting it unconditionally would reopen
 * the bug. Neither is necessary: the walk already knows when the source last
 * moved, so a bundle newer than every source file was built from that source,
 * and anything else is exactly the stale bundle this exists to catch.
 */
function decide({ hasBuild, recorded, fingerprint, buildMs, newestMs }) {
  if (!hasBuild) return { current: false, reason: "no build" };
  if (recorded && recorded === fingerprint) return { current: true, reason: "unchanged" };
  if (recorded) return { current: false, reason: "source changed" };
  if (buildMs >= newestMs) return { current: true, reason: "build is newer than the source" };
  return { current: false, reason: "build of unknown age" };
}

/** Where Next records that a build finished; its absence means there is none. */
function buildIdPath(root = ROOT) {
  return path.join(root, ".next", "BUILD_ID");
}

function buildIsCurrent(root = ROOT) {
  const { fingerprint, newestMs } = sourceFingerprint(SOURCES, root);
  const buildId = buildIdPath(root);
  let buildMs = 0;
  let hasBuild = false;
  try {
    buildMs = fs.statSync(buildId).mtimeMs;
    hasBuild = true;
  } catch {
    hasBuild = false;
  }

  const { readState } = require("./first-run");
  const recorded = readState().build;
  return { ...decide({ hasBuild, recorded, fingerprint, buildMs, newestMs }), fingerprint };
}

/** Remember what was just built, so the next launch has nothing to do. */
function recordBuild(root = ROOT) {
  const { readState, writeState } = require("./first-run");
  const { fingerprint } = sourceFingerprint(SOURCES, root);
  writeState({ ...readState(), build: fingerprint });
  return fingerprint;
}

module.exports = { SOURCES, SKIP, sourceFingerprint, decide, buildIdPath, buildIsCurrent, recordBuild };
