#!/usr/bin/env node

/**
 * Running the tools this repository installed, and only those.
 *
 * Every script here used to reach for `npx`. When the local binary is missing
 * — a partial install, a `--omit=dev` install, an MCP client that starts the
 * server from somewhere else entirely — `npx` does not stop and ask: stdin is
 * not a terminal, so it fetches whatever the registry currently calls latest
 * and runs it. For `prisma` that meant a release two majors ahead being
 * pointed at the only copy of somebody's sites with `db push`.
 *
 * So nothing here resolves through a PATH lookup. The package is resolved from
 * this repository, the file named by its `bin` entry is run with the Node that
 * is already running, and a missing package fails with "run npm install"
 * instead of downloading a stranger's code.
 *
 * The environment is set here too, in one place, because the launcher and the
 * two setup scripts each had their own half of it:
 *
 *   NEXT_TELEMETRY_DISABLED  the Next.js CLI's usage reporting
 *   CHECKPOINT_DISABLE       Prisma's version check, which calls home on
 *                            install and after a schema change
 *
 * Neuravex is sold on running entirely on your machine. That is the whole of
 * what it takes to make that true for the tools it shells out to.
 */

const { execFileSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/**
 * Which interfaces the server answers on, and whether that is a safe answer.
 *
 * Shared by the launcher and `npm start` so the two cannot disagree. Loopback
 * unless HOST says otherwise; there is no sign-in behind this port, so opening
 * it up is something the operator has to ask for in as many words.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function serverHost() {
  const host = process.env.HOST || "127.0.0.1";
  return { host, loopback: LOOPBACK.has(host) };
}

/** The lines to print before opening the builder to the network. */
function exposureWarning(host) {
  return [
    "",
    `WARNING: HOST=${host} — Neuravex will answer on the network.`,
    "WARNING: there is no password. Anyone who can reach this port can",
    "WARNING: read, change and delete every site on this machine.",
    "",
  ];
}

/** What every child process gets, on top of whatever the caller passes. */
const OFFLINE_ENV = {
  NEXT_TELEMETRY_DISABLED: "1",
  CHECKPOINT_DISABLE: "1",
};

/**
 * This repository's own `.env`, read once, for the children that need it.
 *
 * Next loads `.env` itself, so the web app always had DATABASE_URL. Nothing
 * else did: `prisma/seed.ts` builds a bare PrismaClient and `npm run db:seed`
 * gave it an environment with no DATABASE_URL in it, so seeding failed with
 * "Environment variable not found" unless somebody happened to have exported
 * it by hand. Putting it here means every command this file runs sees the
 * same configuration the app does.
 *
 * An already-set variable wins, so a container or a service unit that states
 * DATABASE_URL is not overruled by a file left behind in the checkout.
 */
function dotEnv() {
  let text;
  try {
    text = require("fs").readFileSync(path.join(ROOT, ".env"), "utf8");
  } catch {
    return {};
  }

  const out = {};
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    let value = raw.trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** The environment a child gets: the file, then ours, then the caller's. */
function childEnv(extra = {}) {
  return { ...dotEnv(), ...process.env, ...OFFLINE_ENV, ...extra };
}

/**
 * Say so when `node_modules` is older than the checkout.
 *
 * `git pull` brings new source; it does not bring new dependencies. When a
 * pull crosses a major version the two stop matching, and what the reader
 * gets is not "your install is stale" but whatever the mismatch happens to
 * break first — a React 18 runtime under React 19 source surfaced as
 * "Maximum update depth exceeded" from inside a drag-and-drop library, which
 * is about as far from the cause as a message can get.
 *
 * Majors only. A patch or minor behind is normal between installs and not
 * worth a word; a major behind is the case that produces mystifying failures.
 *
 * Checked once per process, and never fatal: it is a hint, and a wrong hint
 * must not be the thing that stops somebody working.
 */
const MAJOR_MUST_MATCH = ["next", "react", "react-dom"];
let installChecked = false;

/** The leading number of a version or a range: `^19.3.0` and `19.3.0` are both 19. */
function majorOf(version) {
  const match = /(\d+)/.exec(String(version ?? ""));
  return match ? match[1] : null;
}

/**
 * Which of the packages that must match are a major behind, as a pure
 * function of what was asked for and what is there — so the decision can be
 * tested without an actual stale `node_modules`.
 *
 * A package that is absent is not reported: `resolveBin` already says so, and
 * says it better, for the one package the caller actually asked to run.
 */
function staleMajors(wanted, installed) {
  const behind = [];
  for (const pkg of MAJOR_MUST_MATCH) {
    const want = majorOf(wanted[pkg]);
    const has = majorOf(installed[pkg]);
    if (!want || !has) continue;
    if (want !== has) behind.push(`${pkg} ${has} installed, ${want} expected`);
  }
  return behind;
}

/** What is actually in `node_modules` right now, for the packages that matter. */
function installedMajors() {
  const out = {};
  for (const pkg of MAJOR_MUST_MATCH) {
    try {
      out[pkg] = require(require.resolve(`${pkg}/package.json`, { paths: [ROOT] })).version;
    } catch {
      // Absent; see `staleMajors`.
    }
  }
  return out;
}

function warnIfInstallIsStale() {
  if (installChecked) return;
  installChecked = true;

  let wanted;
  try {
    wanted = require(path.join(ROOT, "package.json")).dependencies ?? {};
  } catch {
    return;
  }

  const behind = staleMajors(wanted, installedMajors());
  if (behind.length === 0) return;
  for (const line of [
    "",
    "WARNING: node_modules is older than this checkout.",
    `WARNING: ${behind.join("; ")}.`,
    "WARNING: run `npm install`. Until then errors here may make no sense,",
    "WARNING: because the code and the framework it runs on do not match.",
    "",
  ]) {
    process.stderr.write(`[neuravex] ${line}\n`);
  }
}

/**
 * The file a locally installed package runs, as an absolute path.
 *
 * Throws when the package is not installed, which is the point: the caller
 * turns that into an instruction the reader can act on.
 */
function resolveBin(pkg) {
  let manifestPath;
  try {
    manifestPath = require.resolve(`${pkg}/package.json`, { paths: [ROOT] });
  } catch {
    throw new Error(`${pkg} is not installed. Run \`npm install\` in ${ROOT} first.`);
  }

  const manifest = require(manifestPath);
  const bin = manifest.bin;
  const entry = typeof bin === "string" ? bin : bin && (bin[pkg] || Object.values(bin)[0]);
  if (!entry) throw new Error(`${pkg} does not ship a command to run.`);

  return path.resolve(path.dirname(manifestPath), entry);
}

/** Arguments for `process.execPath` that run a local package's command. */
function nodeArgsFor(pkg, args = []) {
  return [resolveBin(pkg), ...args];
}

/** Runs a local command to completion, with its output on this terminal. */
function runBin(pkg, args, options = {}) {
  warnIfInstallIsStale();
  return execFileSync(process.execPath, nodeArgsFor(pkg, args), {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
    env: childEnv(options.env),
  });
}

/** Runs a local command and hands back everything it said, failure included. */
function captureBin(pkg, args, options = {}) {
  try {
    const output = execFileSync(process.execPath, nodeArgsFor(pkg, args), {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
      env: childEnv(options.env),
    });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: `${err.stdout || ""}${err.stderr || ""}${err.stdout || err.stderr ? "" : err.message}` };
  }
}

/**
 * Starts a local command without a shell.
 *
 * `shell: true` put four processes between the launcher and the server, and a
 * signal sent to the launcher alone reached none of them — the port stayed
 * bound with no window left to say so. Spawning the Node entry point directly
 * means the returned handle is the server, and on POSIX it leads its own
 * process group so the whole tree can be signalled at once.
 */
function spawnBin(pkg, args, options = {}) {
  warnIfInstallIsStale();
  return spawn(process.execPath, nodeArgsFor(pkg, args), {
    cwd: ROOT,
    detached: process.platform !== "win32",
    ...options,
    env: childEnv(options.env),
  });
}

module.exports = {
  ROOT,
  OFFLINE_ENV,
  dotEnv,
  childEnv,
  majorOf,
  staleMajors,
  installedMajors,
  warnIfInstallIsStale,
  serverHost,
  exposureWarning,
  resolveBin,
  nodeArgsFor,
  runBin,
  captureBin,
  spawnBin,
};
