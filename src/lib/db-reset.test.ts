import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const script = readFileSync(join(ROOT, "scripts", "db-reset.js"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("starting over with a fresh database", () => {
  it("is the command the docs send people to", () => {
    expect(pkg.scripts["db:reset"]).toBe("node scripts/db-reset.js");
  });

  it("builds the new database before touching the old one", () => {
    // `db push --force-reset && seed` empties the database first and builds
    // the new one second. Run it while Neuravex is open — which is when
    // anyone runs it — and SQLite can refuse the schema with "database is
    // locked": the sites are gone, the tables never arrive, and every page
    // then throws "The table `main.Site` does not exist".
    const build = script.indexOf('runBin("prisma", ["db", "push", "--force-reset"]');
    const seed = script.indexOf('runBin("tsx", ["prisma/seed.ts"]');
    const swap = script.indexOf("renameSync");
    expect(build).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(build);
    expect(swap).toBeGreaterThan(seed);
  });

  it("builds it somewhere else, so a failure costs nothing", () => {
    expect(script).toContain("const fresh = `${live}.new`");
    // Both build steps are pointed at the new file, never at the live one.
    const calls = [...script.matchAll(/runBin\("[^"]+", \[[^\]]*\], \{ env: \{ DATABASE_URL: (.+?) \} \}\);/g)];
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[1]).toBe("`file:${fresh}`");
    }
  });

  it("says the sites are safe when it cannot finish", () => {
    expect(script).toContain("Your sites are untouched.");
    // The one case a customer can act on: the app still has the file open.
    expect(script).toContain("Quit it, then run this again.");
  });

  it("takes the stale write-ahead log with the database it belongs to", () => {
    // A -wal left behind by the replaced database would be replayed into the
    // new one on the next start.
    expect(script).toContain('const SIDECARS = ["-wal", "-shm", "-journal"]');
    const swap = script.indexOf("renameSync");
    const clearing = script.indexOf("for (const suffix of SIDECARS) fs.rmSync");
    expect(clearing).toBeGreaterThan(-1);
    expect(clearing).toBeLessThan(swap);
  });
});
