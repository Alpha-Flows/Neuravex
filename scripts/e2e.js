#!/usr/bin/env node

/**
 * The browser suite, against a database it made itself.
 *
 * `npm run test:e2e` used to run against whatever `.env` pointed at, which on
 * a developer's machine is `prisma/dev.db` — their real sites. The specs
 * create sites and then clean up after themselves with 95 permanent deletes,
 * so a run that went to the wrong database was not merely untidy: it emptied
 * the trash on the way out. A run I aborted halfway left rows behind that
 * failed the *next* run on duplicates, which is how this was noticed at all.
 *
 * The config alone could not fix it. `webServer.env` is only consulted when
 * Playwright starts the server, and `reuseExistingServer: true` meant it
 * often did not: the desktop launcher's own port is 3939, so a developer with
 * Neuravex open had their running app adopted as the server under test, with
 * their database behind it. That is why this wrapper exists rather than a few
 * more lines in `playwright.config.ts`.
 *
 * `globalSetup` could not own it either — Playwright starts `webServer`
 * before it runs any global setup, so by the time one could create a
 * database, the server has already booted against a different one. Something
 * has to run first, and this is it.
 *
 * So: build a throwaway database and upload directory, point the whole run at
 * them through the environment, and take them away afterwards. The server
 * inherits them because `childEnv()` ranks the real environment above `.env`,
 * so no application code has to know that a test is running.
 *
 * Used by `npm run test:e2e`. Arguments are passed straight through, so
 * `npm run test:e2e -- --ui e2e/public.spec.ts` still works.
 */

const fs = require("fs");
const net = require("net");
const path = require("path");
const { runBin } = require("./local-bin");
const { buildIsCurrent } = require("./build-state");

const ROOT = path.resolve(__dirname, "..");

/** SQLite keeps a write-ahead log and a shared-memory file beside the database. */
const SIDECARS = ["-wal", "-shm", "-journal"];

/**
 * Where the throwaway things live.
 *
 * Under `data/`, which `.gitignore` already ignores whole, so the database and
 * its sidecars cannot be committed by accident. Deliberately *not* under
 * `prisma/`: `databaseFile()`, `backup.js` and `db-reset.js` all reason about
 * that directory, and a second `.db` in it is an invitation to back up or
 * reset the wrong one.
 *
 * The port is not 3939 either. That is the desktop launcher's port, and the
 * whole failure this file exists to prevent began with the suite finding
 * something already answering there.
 */
function scratchPaths() {
  const dir = path.join(ROOT, "data", "e2e");
  return {
    dir,
    database: path.join(dir, "e2e.db"),
    uploads: path.join(dir, "uploads"),
    port: process.env.NEURAVEX_E2E_PORT || "3940",
  };
}

/**
 * The environment that makes a run harmless — the whole of the isolation.
 *
 * `NEURAVEX_E2E` is the token `e2e/global-setup.ts` demands before it will let
 * a single test run, so `npx playwright test` typed directly (which would
 * bypass this file and find `.env` again) stops rather than quietly using the
 * developer's database.
 */
function testEnv(paths = scratchPaths()) {
  return {
    DATABASE_URL: `file:${paths.database}`,
    NEURAVEX_UPLOAD_DIR: paths.uploads,
    NEURAVEX_E2E_PORT: paths.port,
    NEURAVEX_E2E: "1",
  };
}

function say(msg) {
  process.stdout.write(`[neuravex] ${msg}\n`);
}

function remove(file) {
  for (const suffix of ["", ...SIDECARS]) {
    try {
      fs.rmSync(`${file}${suffix}`, { force: true });
    } catch {
      // Someone else is holding it, or it was never there. The run is over
      // either way; a leftover file in `data/e2e` costs the next run nothing
      // because it starts by deleting them.
    }
  }
}

function cleanup(paths) {
  remove(paths.database);
  try {
    fs.rmSync(paths.uploads, { recursive: true, force: true });
  } catch {
    // As above.
  }
}

/** Whether something already answers on the port we are about to ask for. */
function portIsBusy(port) {
  return new Promise((resolve) => {
    const socket = net
      .connect({ host: "127.0.0.1", port: Number(port) })
      .on("connect", () => {
        socket.destroy();
        resolve(true);
      })
      .on("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main(args = []) {
  const paths = scratchPaths();
  const env = testEnv(paths);

  // Playwright is told never to adopt a server it did not start, so a busy
  // port is a failure. Saying which port and why here is friendlier than the
  // timeout Playwright would otherwise report two minutes later.
  if (await portIsBusy(paths.port)) {
    say(`Something is already answering on port ${paths.port}.`);
    say("Quit it, or choose another port with NEURAVEX_E2E_PORT.");
    return 1;
  }

  // The suite runs against `next start`, so it tests the bundle on disk. A
  // bundle older than the source fails in ways that look like the change
  // under test — a page added since the last build simply 404s — so say which
  // it is rather than letting someone debug the wrong thing.
  const build = buildIsCurrent();
  if (!build.current) {
    say(
      build.reason === "no build"
        ? "There is no production build to test. Run `npm run build` first."
        : "The source has changed since the last build, so these tests would run against the old one.",
    );
    say("Run `npm run build`, then try again.");
    return 1;
  }

  // A half-finished run from last time is not something to build on.
  cleanup(paths);
  fs.mkdirSync(paths.uploads, { recursive: true });

  say("Building a throwaway database for the browser suite…");
  try {
    runBin("prisma", ["db", "push", "--force-reset", "--skip-generate"], { env });
    // Seeded, not merely empty: `e2e/public.spec.ts` visits `/sites/demo`.
    runBin("tsx", ["prisma/seed.ts"], { env });
  } catch {
    cleanup(paths);
    say("Could not build the test database. Your own sites are untouched.");
    return 1;
  }

  try {
    runBin("playwright", ["test", ...args], { env });
    return 0;
  } catch (err) {
    return err.status ?? 1;
  } finally {
    // `NEURAVEX_E2E_KEEP=1` leaves it behind, for opening the failing state in
    // a SQLite browser after a red run.
    if (process.env.NEURAVEX_E2E_KEEP) {
      say(`Keeping ${path.relative(ROOT, paths.database)} (NEURAVEX_E2E_KEEP).`);
    } else {
      cleanup(paths);
    }
  }
}

module.exports = { SIDECARS, scratchPaths, testEnv, main };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`[neuravex] ${err.message}\n`);
      process.exit(1);
    },
  );
}
