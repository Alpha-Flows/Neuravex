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
  return execFileSync(process.execPath, nodeArgsFor(pkg, args), {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
    env: { ...process.env, ...OFFLINE_ENV, ...(options.env || {}) },
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
      env: { ...process.env, ...OFFLINE_ENV, ...(options.env || {}) },
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
  return spawn(process.execPath, nodeArgsFor(pkg, args), {
    cwd: ROOT,
    detached: process.platform !== "win32",
    ...options,
    env: { ...process.env, ...OFFLINE_ENV, ...(options.env || {}) },
  });
}

module.exports = {
  ROOT,
  OFFLINE_ENV,
  serverHost,
  exposureWarning,
  resolveBin,
  nodeArgsFor,
  runBin,
  captureBin,
  spawnBin,
};
