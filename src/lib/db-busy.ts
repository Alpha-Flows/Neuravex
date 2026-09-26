/**
 * When another program is writing the database.
 *
 * SQLite lets one writer in at a time, and a second one waits — five seconds,
 * the `busy_timeout` set in `lib/prisma` — before giving up. Something that
 * holds the lock for longer (the MCP agent saving a large page, `npm run
 * backup` taking its snapshot, an import writing a site's worth of rows)
 * turned the editor's save into a 500 with nothing in it, and the author was
 * told only that the save had failed, never why or whether trying again
 * would help. It would have: the lock is always let go.
 *
 * Measured against a database held by another connection, Prisma reports it
 * as P1008, "Operations timed out", once the five seconds are up; an older
 * driver said "database is locked". Either is retried, twice, after a pause
 * that grows; a write that was refused this way did not happen, so running
 * it again cannot run it twice. What still fails after that is reported as
 * the database being busy, in words, by the routes a person is waiting on.
 */

/** Whether an error is SQLite refusing because another writer holds the database. */
export function isDatabaseBusy(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === "P1008") return true;
  return typeof message === "string" && /database is locked|SQLITE_BUSY/i.test(message);
}

export const BUSY_MESSAGE =
  "The database was busy — another program was writing to it for longer than usual. Nothing was lost; try again in a moment.";

export interface RetryOptions {
  /** Tries after the first. */
  retries?: number;
  /** Milliseconds before retry `n`, counting from one. */
  pause?: (n: number) => number;
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** `run`, again after a pause when the database was busy, and its last error when it stays busy. */
export async function retryWhileBusy<T>(run: () => Promise<T>, { retries = 2, pause = (n) => 250 * n, wait = sleep }: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= retries || !isDatabaseBusy(err)) throw err;
      await wait(pause(attempt + 1));
    }
  }
}
