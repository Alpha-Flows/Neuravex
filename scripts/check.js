#!/usr/bin/env node

/**
 * `npm run check` — everything CI runs before a merge, and a release before a
 * tag, run here, in that order, stopping at the first thing that fails.
 *
 * There was no one list. `test:all` was the nearest thing, and it ran the two
 * test suites and nothing else: not lint, which must be clean to the last
 * warning, not the type check, not the advisory gate, and not a build — so
 * "everything passes locally" regularly meant a CI run that did not. The
 * browser suite also needs a build no older than the source, which is the
 * one ordering mistake that is easy to make by hand; here the build comes
 * straight before it.
 *
 *   npm run check             the whole list
 *   npm run check -- --quick  lint, types, unit tests and advisories only
 */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const QUICK = process.argv.includes("--quick");
const { version } = require("../package.json");

/** `npm run <script>`, with the npm that is running this, so no shell and no PATH lookup is needed. */
function npm(script) {
  const cli = process.env.npm_execpath;
  return cli ? [process.execPath, [cli, "run", script]] : ["npm", ["run", script]];
}

const node = (...args) => [process.execPath, args];

const STEPS = [
  ["Lint (0 errors, 0 warnings)", npm("lint")],
  ["Type check", node("scripts/run-local.js", "typescript", "--noEmit")],
  ["Unit tests", npm("test")],
  ["Advisories in what ships", node("scripts/audit-gate.js")],
  ["Changelog and version agree", node("scripts/release.js", "verify", `v${version}`)],
  ...(QUICK
    ? []
    : [
        ["Production build", npm("build")],
        ["Browser tests", npm("test:e2e")],
      ]),
];

const started = Date.now();
for (const [label, [cmd, args]] of STEPS) {
  process.stdout.write(`\n[check] ${label}…\n`);
  const at = Date.now();
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: cmd === "npm" && process.platform === "win32" });
  if (result.status !== 0) {
    process.stdout.write(`\n[check] ✗ ${label} failed. Nothing after it was run.\n`);
    process.exit(result.status || 1);
  }
  process.stdout.write(`[check] ✓ ${label} (${Math.round((Date.now() - at) / 1000)}s)\n`);
}
process.stdout.write(
  `\n[check] Everything passed in ${Math.round((Date.now() - started) / 1000)}s${QUICK ? " — the quick list; the build and browser tests were not run" : ""}.\n`,
);
