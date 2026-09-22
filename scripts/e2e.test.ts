import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { scratchPaths, testEnv, SIDECARS } from "./e2e.js";
import { databaseFile } from "./first-run.js";

/**
 * The browser suite deletes every site it creates, permanently — 95 times
 * across 18 spec files. That is correct behaviour for a suite with its own
 * database and a catastrophe for one pointed at a developer's, so what these
 * cover is not "does the wrapper work" but "can the run reach the real data
 * by any route it used to".
 */

const ROOT = process.cwd();
const wrapper = readFileSync(join(ROOT, "scripts", "e2e.js"), "utf8");
const config = readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
const globalSetup = readFileSync(join(ROOT, "e2e", "global-setup.ts"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("where the browser suite keeps its data", () => {
  it("is the command the docs send people to", () => {
    expect(pkg.scripts["test:e2e"]).toBe("node scripts/e2e.js");
  });

  it("is not the database the app uses", () => {
    // The defect, encoded: `npm run test:e2e` used to run against whatever
    // .env named, which on a developer's machine is their real sites.
    expect(scratchPaths().database).not.toBe(databaseFile());
  });

  it("is not in prisma/, where the backup and reset scripts look", () => {
    // `databaseFile()`, `backup.js` and `db-reset.js` all reason about that
    // directory. A second .db in it is an invitation to back up the wrong one.
    expect(scratchPaths().database.startsWith(resolve(ROOT, "prisma"))).toBe(false);
  });

  it("is under data/, which git ignores whole, sidecars included", () => {
    // .gitignore lists `prisma/dev.db` and its sidecars by name, not by glob,
    // so a scratch database there would need three new entries and would be
    // committed the day someone forgot one.
    expect(scratchPaths().database.startsWith(resolve(ROOT, "data"))).toBe(true);
    expect(readFileSync(join(ROOT, ".gitignore"), "utf8")).toMatch(/^data\/$/m);
  });

  it("keeps the uploads with it", () => {
    // Two specs write real files and one of them lists the directory, so a
    // developer's own pictures would otherwise change the assertions.
    expect(scratchPaths().uploads.startsWith(scratchPaths().dir)).toBe(true);
    expect(testEnv().NEURAVEX_UPLOAD_DIR).toBe(scratchPaths().uploads);
  });

  it("takes the write-ahead log away with the database", () => {
    expect(SIDECARS).toEqual(["-wal", "-shm", "-journal"]);
  });
});

describe("the environment a run happens in", () => {
  it("names the throwaway database, absolutely", () => {
    // Relative `file:` URLs resolve against prisma/, which is the one place
    // this must not land.
    expect(testEnv().DATABASE_URL).toBe(`file:${scratchPaths().database}`);
  });

  it("carries the token the global setup demands", () => {
    expect(testEnv().NEURAVEX_E2E).toBe("1");
  });

  it("builds the database and seeds it before running anything", () => {
    // Seeded, not merely empty: `e2e/public.spec.ts` visits `/sites/demo`.
    const push = wrapper.indexOf('runBin("prisma", ["db", "push", "--force-reset"');
    const seed = wrapper.indexOf('runBin("tsx", ["prisma/seed.ts"]');
    const run = wrapper.indexOf('runBin("playwright", ["test"');
    expect(push).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(push);
    expect(run).toBeGreaterThan(seed);
  });

  it("points every one of those at the throwaway database and nothing else", () => {
    const calls = [...wrapper.matchAll(/runBin\("[^"]+", \[[^\]]*\][^)]*\{ env \}\)/g)];
    expect(calls).toHaveLength(3);
  });
});

describe("the server the suite talks to", () => {
  it("is never one this run did not start", () => {
    // `reuseExistingServer: true` on 3939 — the desktop launcher's own port —
    // is how a developer's running app became the server under test, with
    // their database behind it.
    expect(config).toContain("reuseExistingServer: false");
    expect(config).not.toContain("reuseExistingServer: true");
  });

  it("is not on the port the desktop launcher uses", () => {
    expect(scratchPaths().port).not.toBe("3939");
  });

  it("takes its address from one constant", () => {
    // baseURL and webServer.url were two separate literals; a port change
    // that missed one would point the tests and the server at different
    // places.
    expect(config).toContain("const BASE_URL = `http://127.0.0.1:${PORT}`");
    expect(config).toContain("baseURL: BASE_URL");
    expect(config).toContain("url: BASE_URL");
    expect(config).not.toMatch(/http:\/\/127\.0\.0\.1:3939/);
  });

  it("is checked against the database before any test runs", () => {
    expect(config).toContain('globalSetup: "./e2e/global-setup.ts"');
    expect(globalSetup).toContain('process.env.NEURAVEX_E2E !== "1"');
  });

  it("is proved by a row written to our file and read back through the server", () => {
    // The other direction — POST through the API, then look in the file —
    // would write into the developer's database on exactly the run this is
    // meant to catch.
    const write = globalSetup.indexOf("prisma.site.create");
    const read = globalSetup.indexOf("fetch(new URL(\"/api/sites\"");
    expect(write).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(write);
  });
});

describe("what the specs themselves hardcode", () => {
  it("no longer writes the port out by hand", () => {
    // `request-origin.spec.ts` sent a literal 3939 as a same-origin Origin
    // header. A port change turns that into a 403 from the Origin check,
    // which reads like a real defect in the thing under test.
    const specs = readFileSync(join(ROOT, "e2e", "request-origin.spec.ts"), "utf8");
    expect(specs).not.toContain('"http://127.0.0.1:3939"');
    expect(specs).toContain("process.env.NEURAVEX_E2E_PORT");
  });
});
