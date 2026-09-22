#!/usr/bin/env node

/**
 * Everything Neuravex needs before it can serve a page.
 *
 * Neuravex is downloaded and run on the customer's own machine, so the first
 * thing that happens after unpacking it has to work. It did not: `.env` and
 * the database file are both created locally and neither is in the download,
 * so `npm install && npm run desktop` started a server whose every page threw
 * — the two commands that fix it were in step 2 and step 3 of the README.
 *
 * This runs them instead, does nothing when there is nothing to do, and is
 * safe to run again. It is also what makes a schema change survive an update:
 * `prisma db push` is applied on the way up rather than left as an instruction
 * nobody reads.
 *
 * Used by the desktop launcher, and on its own as `npm run setup`.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ROOT, runBin, captureBin } = require("./local-bin");

const ENV_FILE = path.join(ROOT, ".env");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const SCHEMA = path.join(ROOT, "prisma", "schema.prisma");
/** Remembers the schema we last applied, so a normal start does no work. */
const STATE_FILE = path.join(ROOT, "prisma", ".neuravex-state.json");
/** Columns we removed on purpose, and may therefore drop from a database. */
const DROPS_FILE = path.join(ROOT, "prisma", "intentional-drops.json");

const DEFAULT_ENV = `# Where Neuravex keeps your sites. The path is relative to prisma/.
DATABASE_URL="file:./dev.db"
`;

function say(msg) {
  process.stdout.write(`[neuravex] ${msg}\n`);
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  } catch {
    // A read-only install is not a reason to refuse to start; the only cost
    // is that the next launch checks the schema again.
  }
}

function intentionalDrops() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DROPS_FILE, "utf8"));
    return new Set((parsed.columns || []).map((c) => c.column));
  } catch {
    return new Set();
  }
}

/**
 * Whether the only thing standing in the way is dropping a column we removed
 * on purpose.
 *
 * `prisma db push` refuses to lose data, which is the right default on a
 * machine holding someone's only copy — but it makes removing a dead column
 * impossible to ship. So the loss is read line by line, and accepted only when
 * every line names a column listed in prisma/intentional-drops.json.
 */
function lossIsIntentional(output) {
  const warnings = output.split("\n").filter((line) => line.trim().startsWith("•"));
  if (warnings.length === 0) return false;

  const allowed = intentionalDrops();
  return warnings.every((line) => {
    const m = /drop the column `([^`]+)` on the `([^`]+)` table/.exec(line);
    return m ? allowed.has(`${m[2]}.${m[1]}`) : false;
  });
}

/** A .env with somewhere to keep the data. */
function ensureEnv() {
  // Already told where the data lives — a container, a service unit, an MCP
  // client. Writing a .env there would put a second, contradictory answer
  // next to the real one.
  if (process.env.DATABASE_URL) return false;
  if (fs.existsSync(ENV_FILE)) return false;
  const contents = fs.existsSync(ENV_EXAMPLE) ? fs.readFileSync(ENV_EXAMPLE, "utf8") : DEFAULT_ENV;
  fs.writeFileSync(ENV_FILE, contents);
  say("Created .env — your sites live in prisma/dev.db.");
  return true;
}

/**
 * The DATABASE_URL as a path, so we can tell whether the file is there yet.
 *
 * The environment wins over the file. It did not, and in a container — where
 * DATABASE_URL is set and `.env` is not — this answered `prisma/dev.db`,
 * which never exists, so every start decided the database was new and seeded
 * the demo site again.
 */
function databaseFile() {
  const fromEnv = /^file:(.*)$/.exec((process.env.DATABASE_URL ?? "").trim());
  const relative = fromEnv
    ? fromEnv[1]
    : /^\s*DATABASE_URL\s*=\s*"?(?:file:)?([^"\s]+)"?/m.exec(
        fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "",
      )?.[1] ?? "./dev.db";
  // A relative path in DATABASE_URL is relative to prisma/, the way the
  // schema reads it; an absolute one resolves to itself.
  return path.resolve(ROOT, "prisma", relative);
}

function schemaFingerprint() {
  return crypto.createHash("sha256").update(fs.readFileSync(SCHEMA, "utf8")).digest("hex");
}

/**
 * Bring the database up to the schema. Skipped when the schema has not moved
 * since the last start, so an ordinary launch costs nothing.
 */
function ensureDatabase() {
  const state = readState();
  const fingerprint = schemaFingerprint();
  const dbExists = fs.existsSync(databaseFile());

  if (dbExists && state.schema === fingerprint) return { created: false, changed: false };

  say(dbExists ? "Applying the latest database changes…" : "Setting up the database…");

  // Not --skip-generate: a schema change leaves the generated client behind,
  // and the app then queries columns the database no longer has. This only
  // runs when the schema has actually moved, so it costs nothing on a normal
  // start.
  const first = captureBin("prisma", ["db", "push"]);
  if (!first.ok) {
    if (!lossIsIntentional(first.output)) {
      // db push refuses rather than destroying data it cannot keep, and so
      // does this: whatever it is, it is not something we said was worthless.
      process.stdout.write(first.output);
      say("Could not update the database automatically.");
      say("Your data is untouched. Run `npm run db:push` to see what it needs.");
      throw new Error("database not ready");
    }
    say("Removing settings that were taken out of Neuravex. Your sites are not affected.");
    const second = captureBin("prisma", ["db", "push", "--accept-data-loss"]);
    if (!second.ok) {
      process.stdout.write(second.output);
      say("Could not update the database automatically. Your data is untouched.");
      throw new Error("database not ready");
    }
  }
  writeState({ ...state, schema: fingerprint });
  return { created: !dbExists, changed: dbExists };
}

/** The demo site, once, on a database we just made. */
function seedIfFirstRun(created) {
  if (!created) return;
  try {
    runBin("tsx", ["prisma/seed.ts"]);
  } catch {
    // An empty builder is a perfectly good builder.
    say("Could not add the demo site. Starting with an empty builder.");
  }
}

function firstRun() {
  ensureEnv();
  const { created } = ensureDatabase();
  seedIfFirstRun(created);
  return { created };
}

module.exports = { firstRun, ensureEnv, ensureDatabase, databaseFile, schemaFingerprint, lossIsIntentional, readState, writeState, STATE_FILE };

if (require.main === module) {
  try {
    const { created } = firstRun();
    say(created ? "Ready. Run `npm run desktop` to open Neuravex." : "Everything is already set up.");
  } catch {
    process.exit(1);
  }
}
