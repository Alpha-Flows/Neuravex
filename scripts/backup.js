#!/usr/bin/env node

/**
 * A copy of everything, taken safely, while Neuravex is running.
 *
 * "Back up prisma/dev.db" was the whole of the advice, and it loses data twice
 * over. Once the database is in WAL mode, committed rows sit in `dev.db-wal`
 * until a checkpoint, so a plain copy of `dev.db` taken while the app is open
 * is missing the most recent writes — in testing, the site created a minute
 * earlier. And every picture on every page lives in `public/uploads`, which
 * the database only holds the names of: restoring the file alone gives you
 * back the sites with all the images broken.
 *
 * So this uses SQLite's own `VACUUM INTO`, which takes a consistent snapshot
 * of a live database including whatever is still in the log, and copies the
 * uploads beside it.
 *
 * Usage: npm run backup [destination]
 *        node scripts/backup.js [destination]
 *
 * The default destination is backups/<timestamp>/.
 */

const fs = require("fs");
const path = require("path");
const { ROOT } = require("./local-bin");
const { ensureEnv, databaseFile } = require("./first-run");

const UPLOADS = path.join(ROOT, "public", "uploads");

function say(msg) {
  process.stdout.write(`[neuravex] ${msg}\n`);
}

/** A folder name that sorts by date and is legal on every platform. */
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
}

/**
 * A consistent copy of a live SQLite database.
 *
 * `VACUUM INTO` is run through Prisma's own client, so there is no dependency
 * on the `sqlite3` command line tool being installed. It reads the database
 * the way any other query does, which is what makes it safe against a writer:
 * the snapshot is the state at one point in time, log included.
 */
async function copyDatabase(destination) {
  const { PrismaClient } = require("@prisma/client");
  const client = new PrismaClient();
  try {
    // Quoting: a single quote is the SQL string escape, doubled.
    await client.$executeRawUnsafe(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  ensureEnv();

  const live = databaseFile();
  if (!fs.existsSync(live)) {
    say("There is no database to back up yet. Run `npm run setup` first.");
    return 1;
  }

  const target = path.resolve(ROOT, process.argv[2] || path.join("backups", stamp()));
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    say(`${target} already has something in it. Pick an empty folder.`);
    return 1;
  }
  fs.mkdirSync(target, { recursive: true });

  say("Copying the database…");
  try {
    await copyDatabase(path.join(target, path.basename(live)));
  } catch (err) {
    say(`Could not copy the database (${err.message}).`);
    return 1;
  }

  if (fs.existsSync(UPLOADS)) {
    say("Copying the uploads…");
    // Symbolic links are not followed: a backup is not the place to discover
    // that something in the uploads folder pointed at /etc.
    fs.cpSync(UPLOADS, path.join(target, "uploads"), { recursive: true, dereference: false });
  }

  say(`Done — everything is in ${target}.`);
  say("To restore: quit Neuravex, put the database back at prisma/, and the");
  say("uploads folder back at public/uploads.");
  return 0;
}

module.exports = { main };

if (require.main === module) {
  main().then((code) => process.exit(code));
}
