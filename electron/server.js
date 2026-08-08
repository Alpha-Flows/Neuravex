#!/usr/bin/env node

/**
 * Neuravex Desktop Launcher
 * Starts the Next.js production server and opens the default browser.
 * Works on macOS, Linux, and Windows without Electron.
 *
 * Usage: npm run desktop [port]
 *        node electron/server.js [port]
 */

const { exec, spawn, execSync } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const PORT = parseInt(process.argv[2] || process.env.PORT || "3939", 10);
const URL = `http://localhost:${PORT}`;
const ROOT = path.resolve(__dirname, "..");

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
    execSync("npx next build", { cwd: ROOT, stdio: "inherit" });
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

async function main() {
  log(`Neuravex Website Builder v0.1.0`);
  log(`Starting on port ${PORT}…`);

  ensureBuilt();

  const proc = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: "pipe",
    shell: true,
  });

  proc.stdout.on("data", (d) => process.stdout.write(d));
  proc.stderr.on("data", (d) => process.stderr.write(d));

  // Handle shutdown
  function shutdown() {
    log("Shutting down…");
    proc.kill("SIGTERM");
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
    proc.kill();
    process.exit(1);
  }
}

main();
