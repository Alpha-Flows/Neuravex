#!/usr/bin/env node

/**
 * Neuravex Desktop Launcher
 * Starts the Next.js production server and opens the default browser.
 * Works on macOS, Linux, and Windows without Electron.
 *
 * Usage: npm run desktop [port] [--no-browser]
 *        node electron/server.js [port] [--no-browser]
 *
 * `--no-browser`, or NEURAVEX_NO_BROWSER=1, is for running it as a service,
 * where there is nobody at the screen to open a tab for.
 */

const { exec } = require("child_process");
const http = require("http");
const net = require("net");
const { firstRun } = require("../scripts/first-run");
const { spawnBin, serverHost, exposureWarning } = require("../scripts/local-bin");
const { buildIsCurrent } = require("../scripts/build-state");
const { runBuild } = require("../scripts/build");
const { version: VERSION, engines } = require("../package.json");

const ARGS = process.argv.slice(2);
const PORT_ARG = ARGS.find((a) => !a.startsWith("--"));
const PORT = Number(PORT_ARG || process.env.PORT || "3939");
const NO_BROWSER = ARGS.includes("--no-browser") || process.env.NEURAVEX_NO_BROWSER === "1";

/**
 * Which network interfaces the builder answers on.
 *
 * Neuravex has no sign-in: the design says the only browser that can reach it
 * is the one on this machine. `next start` does not agree — left alone it
 * listens on every interface, so on a café network or a shared office LAN
 * every other host could read, rewrite and delete every site, and the Origin
 * check does not slow a script down because a script simply omits the header.
 *
 * So loopback is the default, and opening it up is a thing you have to say out
 * loud with HOST. When you do, the warning below is the loudest thing on the
 * terminal, because there is still no password on the other side of it.
 */
const { host: HOST, loopback: LOOPBACK } = serverHost();
const URL = `http://localhost:${PORT}`;

function log(msg) {
  process.stdout.write(`[neuravex] ${msg}\n`);
}

/**
 * The oldest Node this runs on, from `engines` in package.json.
 *
 * `npm install` refuses an older one, but Node is changed more often than
 * Neuravex is installed, and what an older one produced on the next start
 * was a stack trace from somewhere inside Next.
 */
function nodeIsRecentEnough() {
  const need = /(\d+)\.(\d+)/.exec(engines?.node ?? "") ?? [];
  const [major, minor] = process.versions.node.split(".").map(Number);
  const [needMajor, needMinor] = [Number(need[1] ?? 0), Number(need[2] ?? 0)];
  return major > needMajor || (major === needMajor && minor >= needMinor);
}

/** The address the launcher asks its own server on: the one it is bound to, or loopback for "every interface". */
function askHost() {
  if (HOST === "0.0.0.0") return "127.0.0.1";
  if (HOST === "::") return "::1";
  return HOST;
}

/**
 * What answers `/api/health` on the port: Neuravex's own answer, or null for
 * nothing, or for something that is not Neuravex.
 */
function health() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: askHost(), port: PORT, path: "/api/health", headers: { host: `localhost:${PORT}` }, timeout: 3000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (body.length < 8192) body += chunk;
        });
        res.on("end", () => {
          try {
            const answer = JSON.parse(body);
            resolve(answer && answer.app === "neuravex" ? { status: res.statusCode, ...answer } : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

/** Whether the port can be listened on, which is the only reliable way to ask whether something else already is. */
function portIsFree() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err) => resolve(err.code !== "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(PORT, HOST);
  });
}

// Open the browser (cross-platform)
function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) log(`Could not open browser automatically. Open ${url} manually.`);
  });
}

/**
 * Make sure the bundle about to be served was built from the source on disk.
 *
 * This used to ask only whether `.next` existed, so `git pull && npm run
 * desktop` served last month's bundle — and by this point `firstRun()` has
 * already migrated the database to the new schema, so the old code is running
 * against a shape it does not know. `INSTALL.md` promised a rebuild all along.
 */
function ensureBuilt() {
  const { current, reason } = buildIsCurrent();
  if (current) return;

  log(
    reason === "no build"
      ? "Production build not found. Running `next build`…"
      : "The source has changed since the last build. Rebuilding…",
  );
  try {
    runBuild();
    log("Build complete.");
  } catch {
    // There is no falling back on what is already there: the database has
    // just been migrated, and the old bundle against the new schema is the
    // exact failure this check exists to prevent.
    log("Could not build. Run `npm run build` to see what it needs.");
    process.exit(1);
  }
}

/**
 * Wait until the server says it is Neuravex, or until it has gone.
 *
 * This took any answer below 500 on the port as ready. With another program
 * already listening there, `next start` failed to bind and left, and the
 * launcher printed "Ready!", opened a tab on the other program and exited 0.
 * Only Neuravex's own health answer counts now, and a server that exits
 * while it is being waited for ends the wait at once instead of after
 * fifteen seconds of asking an empty port.
 */
function waitForServer(proc, retries = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let gone = false;
    proc.once("exit", () => {
      gone = true;
      reject(new Error("exited"));
    });
    async function attempt(n) {
      if (gone) return;
      const answer = await health();
      if (gone) return;
      if (answer) return resolve(answer);
      if (n <= 0) return reject(new Error("timeout"));
      setTimeout(() => attempt(n - 1), interval);
    }
    attempt(retries);
  });
}


/**
 * End the server, and wait until it has actually ended.
 *
 * The old version signalled a `sh -c` wrapper and called `process.exit` in the
 * same breath. The shell died; `next-server`, two processes further down, did
 * not, and kept the port bound with no window left to tell the owner. The
 * server is now spawned directly and, on POSIX, leads its own process group —
 * so a negative PID reaches the whole tree, `taskkill /T` does the same on
 * Windows, and either way we wait for the exit before leaving.
 */
function stopServer(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return resolve();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(hard);
      resolve();
    };
    proc.once("exit", finish);

    if (process.platform === "win32") {
      exec(`taskkill /pid ${proc.pid} /T /F`, () => {});
    } else {
      signalGroup(proc, "SIGTERM");
    }

    // A server that will not leave politely is still holding the port.
    const hard = setTimeout(() => {
      if (process.platform !== "win32") signalGroup(proc, "SIGKILL");
      finish();
    }, 5000);
    hard.unref?.();
  });
}

/** Signals the child's whole process group, falling back to the child alone. */
function signalGroup(proc, signal) {
  try {
    process.kill(-proc.pid, signal);
  } catch {
    try {
      proc.kill(signal);
    } catch {
      // Already gone.
    }
  }
}

/**
 * Before anything else: is the port ours to take?
 *
 * Neuravex already on it is the second double-click of a launcher somebody
 * thought had not started — that copy is opened and this one leaves, without
 * touching the database the first one is using. Anything else on it is said
 * plainly, with the command that avoids it, before a build that could take a
 * minute is spent on a server that cannot start.
 */
async function claimPort() {
  if (await portIsFree()) return;
  const answer = await health();
  if (answer) {
    log(`${answer.version ? `Neuravex ${answer.version}` : "Neuravex"} is already running at ${URL}.`);
    if (!NO_BROWSER) {
      log("Opening it.");
      openBrowser(URL);
    }
    process.exit(0);
  }
  const other = PORT === 4000 ? 4001 : 4000;
  log(`Port ${PORT} is in use by another program, so Neuravex cannot start on it.`);
  log(`Start it on another port instead: npm run desktop ${other}   (or: node electron/server.js ${other})`);
  process.exit(1);
}

async function main() {
  log(`Neuravex Website Builder v${VERSION}`);

  if (!nodeIsRecentEnough()) {
    log(`Neuravex needs Node.js ${engines.node.replace(/^>=\s*/, "")} or newer, and this is ${process.version}.`);
    log("Install the current LTS from https://nodejs.org and start Neuravex again.");
    process.exit(1);
  }
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    log(`"${PORT_ARG ?? process.env.PORT}" is not a port. Give a number such as 4000: npm run desktop 4000`);
    process.exit(1);
  }
  await claimPort();

  // The database holds visitor form submissions and the uploads directory
  // holds whatever was put in it. On a machine with more than one account,
  // neither is anybody else's business, so nothing this process creates is
  // readable outside it.
  if (process.platform !== "win32") process.umask(0o077);

  // Everything the app needs before it can serve a page: somewhere to keep the
  // data, and a database that matches the schema. A fresh copy has neither,
  // and this used to start a server whose every page threw until the reader
  // found steps 2 and 3 of the README.
  try {
    firstRun();
  } catch {
    log("Neuravex cannot start until that is sorted out.");
    process.exit(1);
  }

  log(`Starting on port ${PORT}…`);
  if (!LOOPBACK) exposureWarning(HOST).forEach(log);
  ensureBuilt();

  const proc = spawnBin("next", ["start", "-H", HOST, "-p", String(PORT)], { stdio: "pipe" });
  log(`Server started (process ${proc.pid}).`);

  let portTaken = false;
  proc.stdout.on("data", (d) => process.stdout.write(d));
  proc.stderr.on("data", (d) => {
    if (/EADDRINUSE/.test(String(d))) portTaken = true;
    process.stderr.write(d);
  });

  // Handle shutdown
  let leaving = false;
  async function shutdown() {
    if (leaving) return;
    leaving = true;
    log("Shutting down…");
    await stopServer(proc);
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // The server leaving on its own is never a normal end. The launcher used to
  // go quietly with it — its pipes closed, the event loop emptied, exit 0 —
  // so a crashed builder looked, to a terminal or a service manager, exactly
  // like one somebody had closed. It says so now, and leaves with a failure a
  // supervisor can restart on.
  proc.once("exit", (code, signal) => {
    if (leaving) return;
    leaving = true;
    if (portTaken) log(`Port ${PORT} was taken by another program as the server started. Start on another port: npm run desktop ${PORT === 4000 ? 4001 : 4000}`);
    else log(`The server stopped unexpectedly (${signal ? `signal ${signal}` : `exit code ${code}`}). The messages above say why.`);
    process.exit(typeof code === "number" && code !== 0 ? code : 1);
  });

  let answer;
  try {
    answer = await waitForServer(proc);
  } catch (err) {
    if (err.message === "exited") return; // said above, by the exit handler
    log("The server did not answer in time. Check the messages above for errors.");
    leaving = true;
    await stopServer(proc);
    process.exit(1);
  }
  if (!answer.ok) {
    log(
      `Started, but ${[
        answer.database !== "ok" ? "the database could not be reached" : "",
        answer.uploads !== "writable" ? "the uploads folder cannot be written to" : "",
      ]
        .filter(Boolean)
        .join(" and ")}. Pages may not load or save until that is fixed.`,
    );
  }
  if (NO_BROWSER) {
    log(`Ready at ${URL}`);
  } else {
    log(`Ready! Opening ${URL}`);
    openBrowser(URL);
  }
}

main();
