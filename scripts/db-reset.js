#!/usr/bin/env node

/**
 * Start over with a fresh database — without betting your data on it working.
 *
 * `prisma db push --force-reset && tsx prisma/seed.ts` empties the database
 * first and builds the new one second. Run it while Neuravex is open — which
 * is when anyone would run it — and SQLite can refuse the schema halfway:
 *
 *     The SQLite database "dev.db" at "file:./dev.db" was successfully reset.
 *     Error: SQLite database error
 *     database is locked
 *
 * The sites are gone by then and the schema never lands, so the app comes
 * back up throwing "The table `main.Site` does not exist" on every page, with
 * nothing on screen to say what to do about it.
 *
 * So the new database is built and seeded beside the old one, and only put in
 * its place once it works. A failure anywhere leaves the existing database
 * exactly as it was.
 *
 * Used by `npm run db:reset`.
 */

const fs = require("fs");
const { ensureEnv, databaseFile, schemaFingerprint, STATE_FILE } = require("./first-run");
const { runBin } = require("./local-bin");

/** SQLite keeps a write-ahead log and a shared-memory file beside the database. */
const SIDECARS = ["-wal", "-shm", "-journal"];

function say(msg) {
  process.stdout.write(`[neuravex] ${msg}\n`);
}

function remove(file) {
  for (const suffix of ["", ...SIDECARS]) {
    try {
      fs.rmSync(`${file}${suffix}`, { force: true });
    } catch {
      // Nothing here to clean up, or someone else is holding it. Either way
      // the caller decides what that means.
    }
  }
}

/** Remembers which schema this database has, so the next start does no work. */
function recordSchema() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, schema: schemaFingerprint() }, null, 2) + "\n");
  } catch {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify({ schema: schemaFingerprint() }, null, 2) + "\n");
    } catch {
      // A read-only install only costs the next start a schema check.
    }
  }
}

function main() {
  ensureEnv();
  const live = databaseFile();
  const fresh = `${live}.new`;

  // A half-finished run from last time is not something to build on.
  remove(fresh);

  say("Building a fresh database…");
  try {
    runBin("prisma", ["db", "push", "--force-reset"], { env: { DATABASE_URL: `file:${fresh}` } });
    runBin("tsx", ["prisma/seed.ts"], { env: { DATABASE_URL: `file:${fresh}` } });
  } catch {
    remove(fresh);
    say("Could not build the new database. Your sites are untouched.");
    return 1;
  }

  // The last step, and the only destructive one. A stale write-ahead log
  // belongs to the database being replaced, so it goes with it.
  try {
    for (const suffix of SIDECARS) fs.rmSync(`${live}${suffix}`, { force: true });
    fs.renameSync(fresh, live);
  } catch (err) {
    remove(fresh);
    if (["EBUSY", "EPERM", "EACCES"].includes(err.code)) {
      say("Neuravex still has the database open. Quit it, then run this again.");
    } else {
      say(`Could not replace the database (${err.code || err.message}).`);
    }
    say("Your sites are untouched.");
    return 1;
  }

  recordSchema();
  say("Done — a fresh database with the demo site in it.");
  say("If Neuravex is open, quit and start it again: it is still holding the old copy.");
  return 0;
}

module.exports = { main };

if (require.main === module) {
  process.exit(main());
}
