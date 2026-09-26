import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { BUSY_MESSAGE, isDatabaseBusy, retryWhileBusy } from "@/lib/db-busy";

/**
 * Another program holding the database. The error shapes below are the ones
 * measured: Prisma's P1008 from a database held by a second connection past
 * the busy timeout, and the "database is locked" an older driver said.
 */

const timedOut = Object.assign(new Error("Operations timed out after `N/A`. Context: The database failed to respond to a query within the configured timeout"), { code: "P1008" });
const locked = new Error("SQLite database error: database is locked");
const noWait = { wait: async () => {} };

describe("a busy database", () => {
  it("is recognised by Prisma's code or by SQLite's words", () => {
    expect(isDatabaseBusy(timedOut)).toBe(true);
    expect(isDatabaseBusy(locked)).toBe(true);
    expect(isDatabaseBusy(new Error("SQLITE_BUSY: cannot commit"))).toBe(true);
  });

  it("is not every error", () => {
    expect(isDatabaseBusy(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))).toBe(false);
    expect(isDatabaseBusy(new Error("no such table: Page"))).toBe(false);
    expect(isDatabaseBusy(null)).toBe(false);
    expect(isDatabaseBusy("database is locked")).toBe(false);
  });
});

describe("retrying while it is busy", () => {
  it("runs once when nothing is in the way", async () => {
    let runs = 0;
    expect(await retryWhileBusy(async () => ++runs, noWait)).toBe(1);
    expect(runs).toBe(1);
  });

  it("tries again, after a growing pause, and returns what finally worked", async () => {
    let runs = 0;
    const pauses: number[] = [];
    const result = await retryWhileBusy(
      async () => {
        runs += 1;
        if (runs < 3) throw timedOut;
        return "written";
      },
      { wait: async (ms) => void pauses.push(ms) },
    );
    expect(result).toBe("written");
    expect(runs).toBe(3);
    expect(pauses).toEqual([250, 500]);
  });

  it("gives up after two more tries with the busy error itself", async () => {
    let runs = 0;
    await expect(
      retryWhileBusy(async () => {
        runs += 1;
        throw locked;
      }, noWait),
    ).rejects.toBe(locked);
    expect(runs).toBe(3);
  });

  it("never retries an error that is not the database being busy", async () => {
    let runs = 0;
    const other = new Error("no such table: Page");
    await expect(
      retryWhileBusy(async () => {
        runs += 1;
        throw other;
      }, noWait),
    ).rejects.toBe(other);
    expect(runs).toBe(1);
  });
});

describe("where it is used", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("covers every query the app and the MCP server make", () => {
    // One client for both, extended once; see the comment in mcp-server.ts.
    expect(read("src/lib/prisma.ts")).toMatch(/return retryWhileBusy\(\(\) => query\(args\)\);/);
    expect(read("mcp-server.ts")).toMatch(/import \{ prisma \} from "\.\/src\/lib\/prisma";/);
  });

  it("answers a save that still could not wait with a 503 in words", () => {
    const route = read("src/app/api/pages/[id]/save/route.ts");
    expect(route).toMatch(/if \(isDatabaseBusy\(err\)\) return NextResponse\.json\(\{ error: BUSY_MESSAGE \}, \{ status: 503 \}\);/);
    expect(BUSY_MESSAGE).toMatch(/Nothing was lost/);
  });
});
