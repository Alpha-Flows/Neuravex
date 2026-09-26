#!/usr/bin/env node

/**
 * `npm run smoke [folder]` — start Neuravex the way a customer does, and check
 * that it comes up, stops, refuses a port somebody else holds, and says so
 * when its server dies.
 *
 * Every suite ran the app from a working checkout through `next start`, with
 * the database, `.env` and the build already there. A customer runs none of
 * that: they have a fresh folder, `npm ci` and the launcher, which writes
 * `.env`, creates the database, seeds it, builds and serves. Nothing ran that
 * path from end to end, and it showed — the launcher that answered "Ready!"
 * to a port another program held, opened a tab on that program and exited 0
 * had passed every test there was.
 *
 * So this runs the launcher in the folder it is given (the unpacked release
 * archive, in the release workflow) against a database and an uploads folder
 * of its own in a temporary directory, which means it can also be run in a
 * working checkout without going near the sites in it. The steps stop and
 * kill processes the POSIX way, so it runs on macOS and Linux.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const DIR = path.resolve(process.argv[2] || ".");
const PORT = Number(process.env.SMOKE_PORT || 3960);
const BUSY_PORT = PORT + 1;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "neuravex-smoke-"));
const { version: VERSION } = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8"));

const ENV = {
  ...process.env,
  NEURAVEX_NO_BROWSER: "1",
  DATABASE_URL: `file:${path.join(TMP, "smoke.db")}`,
  NEURAVEX_UPLOAD_DIR: path.join(TMP, "uploads"),
};
delete ENV.PORT;
delete ENV.HOST;

/** Every launcher started, so a failure can take them all down with it. */
const launched = [];

function say(line) {
  process.stdout.write(`[smoke] ${line}\n`);
}

/** The launcher, on a port, with everything it prints kept and its own lines shown as they come. */
function launch(port) {
  const proc = spawn(process.execPath, [path.join(DIR, "electron", "server.js"), String(port)], {
    cwd: DIR,
    env: ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const run = { proc, output: "", exit: null };
  const keep = (chunk) => {
    const text = String(chunk);
    run.output = (run.output + text).slice(-200_000);
    for (const line of text.split("\n")) if (line.includes("[neuravex]")) process.stdout.write(`        ${line.trim()}\n`);
  };
  proc.stdout.on("data", keep);
  proc.stderr.on("data", keep);
  run.exited = new Promise((resolve) => proc.once("exit", (code, signal) => resolve((run.exit = { code, signal }))));
  launched.push(run);
  return run;
}

/** The process id of the server a launcher started, from the line it prints. */
function serverPid(run) {
  const match = /Server started \(process (\d+)\)/.exec(run.output);
  return match ? Number(match[1]) : null;
}

function get(port, route) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: route, headers: { host: `localhost:${port}` }, timeout: 15_000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** `ask` again until it answers something, or the time runs out. */
async function until(ask, ms, every = 1000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const answer = await ask();
    if (answer) return answer;
    await pause(every);
  }
  return null;
}

/** A launcher's exit, or null when it is still running after `ms`. */
function exitWithin(run, ms) {
  return Promise.race([run.exited, pause(ms).then(() => null)]);
}

function kill(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone.
  }
}

async function cleanUp() {
  for (const run of launched) {
    const server = serverPid(run);
    if (run.exit === null) kill(run.proc.pid, "SIGTERM");
    if (run.exit === null && !(await exitWithin(run, 10_000))) kill(run.proc.pid, "SIGKILL");
    if (server) kill(-server, "SIGKILL");
  }
  fs.rmSync(TMP, { recursive: true, force: true });
}

let failures = 0;
async function step(name, check) {
  let problem;
  try {
    problem = await check();
  } catch (err) {
    problem = err instanceof Error ? err.message : String(err);
  }
  if (!problem) {
    say(`✓ ${name}`);
    return;
  }
  failures += 1;
  say(`✗ ${name}: ${problem}`);
  for (const run of launched) {
    process.stdout.write(`\n--- launcher on this port printed (last part) ---\n${run.output.slice(-6000)}\n`);
  }
  await cleanUp();
  process.exit(1);
}

async function main() {
  if (process.platform === "win32") {
    say("The smoke test stops processes the POSIX way; run it on macOS or Linux.");
    process.exit(2);
  }
  say(`Neuravex ${VERSION} in ${DIR}`);
  say(`Database and uploads in ${TMP}`);

  await step(`ports ${PORT} and ${BUSY_PORT} are free to test on`, async () =>
    (await portIsFree(PORT)) && (await portIsFree(BUSY_PORT)) ? null : "something is already listening; set SMOKE_PORT",
  );

  const first = launch(PORT);
  await step("starts from nothing: .env, database, demo site, build, server", async () => {
    // The build is the slow part: a few minutes on a small CI machine.
    const health = await until(async () => {
      if (first.exit) return { gone: true };
      const answer = await get(PORT, "/api/health");
      return answer?.status === 200 ? JSON.parse(answer.body) : null;
    }, 15 * 60_000, 2000);
    if (!health) return "no answer from /api/health within fifteen minutes";
    if (health.gone) return `the launcher exited (${JSON.stringify(first.exit)})`;
    if (health.app !== "neuravex") return `/api/health answered ${JSON.stringify(health)}`;
    if (health.version !== VERSION) return `it says it is ${health.version}, package.json says ${VERSION}`;
    if (!health.ok) return `it is up but not well: ${JSON.stringify(health)}`;
    return null;
  });

  await step("serves the dashboard and the demo site", async () => {
    const dashboard = await get(PORT, "/");
    if (dashboard?.status !== 200) return `/ answered ${dashboard?.status ?? "nothing"}`;
    const demo = await get(PORT, "/sites/demo");
    if (demo?.status !== 200) return `/sites/demo answered ${demo?.status ?? "nothing"}`;
    return null;
  });

  await step("a second copy finds the first one and leaves", async () => {
    const second = launch(PORT);
    const exit = await exitWithin(second, 60_000);
    if (!exit) return "it was still running after a minute";
    if (exit.code !== 0) return `it exited with ${exit.code}`;
    if (!/already running/.test(second.output)) return "it did not say Neuravex was already running";
    if (serverPid(second)) return "it started a server of its own";
    return null;
  });

  await step("a port another program holds is refused, in words", async () => {
    const squatter = http.createServer((_req, res) => res.writeHead(404).end("not neuravex"));
    await new Promise((done) => squatter.listen(BUSY_PORT, "127.0.0.1", done));
    try {
      const third = launch(BUSY_PORT);
      const exit = await exitWithin(third, 60_000);
      if (!exit) return "it was still running after a minute";
      if (exit.code === 0) return "it exited 0, as if it had started";
      if (!/in use by another program/.test(third.output)) return "it did not say the port was in use";
      if (/Ready/.test(third.output)) return "it said it was ready";
      return null;
    } finally {
      await new Promise((done) => squatter.close(done));
    }
  });

  await step("stops when asked, and frees the port", async () => {
    kill(first.proc.pid, "SIGTERM");
    const exit = await exitWithin(first, 30_000);
    if (!exit) return "it was still running thirty seconds after SIGTERM";
    if (exit.code !== 0) return `it exited with ${exit.code}`;
    const free = await until(() => portIsFree(PORT), 10_000, 500);
    return free ? null : "the port was still held after it had exited";
  });

  await step("says so, and fails, when its server dies", async () => {
    const fourth = launch(PORT);
    const up = await until(async () => (await get(PORT, "/api/health"))?.status === 200, 3 * 60_000, 1000);
    if (!up) return "it did not come back up";
    const server = serverPid(fourth);
    if (!server) return "it did not say which process the server is";
    kill(-server, "SIGKILL");
    const exit = await exitWithin(fourth, 30_000);
    if (!exit) return "the launcher was still running thirty seconds after its server died";
    if (exit.code === 0) return "the launcher exited 0, as if it had been closed";
    if (!/stopped unexpectedly/.test(fourth.output)) return "it did not say the server had stopped";
    return null;
  });

  await cleanUp();
  say(failures ? `${failures} step(s) failed.` : "Every step passed.");
}

process.on("SIGINT", async () => {
  await cleanUp();
  process.exit(130);
});

main();
