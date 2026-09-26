import { chmod } from "fs/promises";
import { PrismaClient } from "@prisma/client";
import { retryWhileBusy } from "./db-busy";

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

/**
 * The SQLite settings the app runs on, actually applied.
 *
 * They were not. The three `$queryRawUnsafe` calls sat inside a `.then()` and
 * were neither awaited nor returned, and a Prisma query is a lazy promise
 * that only runs when something waits on it — so `journal_mode=WAL` was never
 * set by the web app at all. A fresh database stayed in `delete` mode on
 * every run; awaiting the same calls flipped it. The comments here, in
 * `mcp-server.ts` and in `src/lib/mcp-server.test.ts` all described behaviour
 * that did not exist.
 *
 * The impact was narrower than those comments implied — Prisma's SQLite
 * driver already defaults `busy_timeout` to 5000 and `foreign_keys` on, and
 * WAL is a property of the file, so any database the MCP server had touched
 * once stayed in WAL. What a web-only install lost was WAL's reader/writer
 * independence: a write transaction longer than five seconds surfaced as a
 * 500 on whatever page happened to be reading.
 */
async function applyPragmas(client: PrismaClient): Promise<void> {
  await client.$connect();
  // Awaited, one at a time: `journal_mode` is the one that has to land, and
  // it cannot land inside another statement's transaction.
  await client.$queryRawUnsafe("PRAGMA journal_mode=WAL");
  await client.$queryRawUnsafe("PRAGMA busy_timeout=5000");
  await client.$queryRawUnsafe("PRAGMA foreign_keys=ON");
}

/**
 * The database holds every visitor form submission, so on a machine with more
 * than one account it is not anybody else's business. The journal and the
 * shared-memory file carry the same rows before a checkpoint, so they go too.
 */
async function restrictPermissions(): Promise<void> {
  if (process.platform === "win32") return;

  const url = process.env.DATABASE_URL ?? "";
  const match = /^file:(.*)$/.exec(url.trim());
  if (!match) return;

  // The path in DATABASE_URL is relative to prisma/, the way the schema reads it.
  const { resolve } = await import("path");
  const base = resolve(process.cwd(), "prisma", match[1]);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    await chmod(`${base}${suffix}`, 0o600).catch(() => {
      // Not there, or not ours to change. Neither is a reason not to start.
    });
  }
}

/**
 * Say which step was missed, rather than letting Prisma say which line of the
 * schema it was on.
 *
 * `.env` is not in the repository — it is written by `npm run setup` and by
 * the desktop launcher — so a checkout that has only ever had `npm install`
 * run on it has no `DATABASE_URL`. What that produced was a Prisma validation
 * error pointing at `schema.prisma:10`, which tells a first-time reader
 * nothing about the command they have not run yet.
 */
function requireDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  throw new Error(
    "DATABASE_URL is not set, so Neuravex does not know where your sites are kept.\n" +
      "Run `npm run setup` once — it writes .env, creates the database and adds the demo site.\n" +
      "`npm run desktop` does the same thing on its way up.",
  );
}

const prismaClientSingleton = () => {
  requireDatabaseUrl();

  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  /**
   * Every query waits for the settings above.
   *
   * A `$extends` hook is the only place to put this that covers the queries
   * made before the setup has finished — which, on a cold start, is most of
   * the first page load.
   */
  const ready = applyPragmas(client)
    .then(() => restrictPermissions())
    .catch((err) => {
      console.error("[neuravex] could not configure SQLite:", err);
    });

  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        await ready;
        // Another program holding the database is waited out rather than
        // reported as a failure; see `lib/db-busy`.
        return retryWhileBusy(() => query(args));
      },
    },
  }) as unknown as PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
