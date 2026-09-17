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

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const SCHEMA = path.join(ROOT, "prisma", "schema.prisma");
/** Remembers the schema we last applied, so a normal start does no work. */
const STATE_FILE = path.join(ROOT, "prisma", ".neuravex-state.json");

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

function run(command, args) {
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    shell: process.platform === "win32",
  });
}

/** A .env with somewhere to keep the data. */
function ensureEnv() {
  if (fs.existsSync(ENV_FILE)) return false;
  const contents = fs.existsSync(ENV_EXAMPLE) ? fs.readFileSync(ENV_EXAMPLE, "utf8") : DEFAULT_ENV;
  fs.writeFileSync(ENV_FILE, contents);
  say("Created .env — your sites live in prisma/dev.db.");
  return true;
}

/** The DATABASE_URL as a path, so we can tell whether the file is there yet. */
function databaseFile() {
  const match = /^\s*DATABASE_URL\s*=\s*"?(?:file:)?([^"\s]+)"?/m.exec(
    fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "",
  );
  const relative = match ? match[1] : "./dev.db";
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
  try {
    run("npx", ["prisma", "db", "push", "--skip-generate"]);
  } catch {
    // db push refuses rather than destroying data it cannot keep.
    say("Could not update the database automatically.");
    say("Your data is untouched. Run `npx prisma db push` to see what it needs.");
    throw new Error("database not ready");
  }
  writeState({ ...state, schema: fingerprint });
  return { created: !dbExists, changed: dbExists };
}

/** The demo site, once, on a database we just made. */
function seedIfFirstRun(created) {
  if (!created) return;
  try {
    run("npm", ["run", "db:seed"]);
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

module.exports = { firstRun, ensureEnv, ensureDatabase, databaseFile, schemaFingerprint, STATE_FILE };

if (require.main === module) {
  try {
    const { created } = firstRun();
    say(created ? "Ready. Run `npm run desktop` to open Neuravex." : "Everything is already set up.");
  } catch {
    process.exit(1);
  }
}
