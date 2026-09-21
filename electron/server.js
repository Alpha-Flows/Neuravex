#!/usr/bin/env node

/**
 * Neuravex Desktop Launcher
 * Starts the Next.js production server and opens the default browser.
 * Works on macOS, Linux, and Windows without Electron.
 *
 * Usage: npm run desktop [port]
 *        node electron/server.js [port]
 */

const { exec } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { firstRun } = require("../scripts/first-run");
const { ROOT, runBin, spawnBin, serverHost, exposureWarning } = require("../scripts/local-bin");
const { version: VERSION } = require("../package.json");

const PORT = parseInt(process.argv[2] || process.env.PORT || "3939", 10);

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

// Check if .next build exists
function ensureBuilt() {
  const dotNext = path.join(ROOT, ".next");
  if (!fs.existsSync(dotNext)) {
    log("Production build not found. Running `next build`…");
    runBin("next", ["build"]);
    log("Build complete.");
  }
}

// Wait until the server is ready
function waitForServer(url, retries = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      http
        .get(url, (res) => {
          if (res.statusCode < 500) resolve(true);
          else retry();
        })
        .on("error", retry);
      function retry() {
        if (n <= 0) reject(new Error("Server did not start in time"));
        else setTimeout(() => attempt(n - 1), interval);
      }
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

async function main() {
  log(`Neuravex Website Builder v${VERSION}`);

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

  proc.stdout.on("data", (d) => process.stdout.write(d));
  proc.stderr.on("data", (d) => process.stderr.write(d));

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

  try {
    await waitForServer(URL);
    log(`Ready! Opening ${URL}`);
    openBrowser(URL);
  } catch {
    log("Failed to start server. Check the logs above for errors.");
    await stopServer(proc);
    process.exit(1);
  }
}

main();
