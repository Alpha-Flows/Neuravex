import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { majorOf, staleMajors, installedMajors } from "./local-bin.js";

/**
 * The warning that would have saved somebody an afternoon.
 *
 * `git pull` brings new source and not new dependencies, so a pull across a
 * major leaves the two disagreeing. What that produced in practice was not a
 * message about installing anything: React 18 under React 19 source surfaced
 * as "Maximum update depth exceeded" from inside a drag-and-drop library, and
 * the missing `.env` before it surfaced as a Prisma validation error pointing
 * at a line of the schema.
 */

const ROOT = process.cwd();
const source = readFileSync(join(ROOT, "scripts", "local-bin.js"), "utf8");
const prisma = readFileSync(join(ROOT, "src", "lib", "prisma.ts"), "utf8");

describe("reading a version", () => {
  it("takes the major from a range or an exact version alike", () => {
    expect(majorOf("^19.3.0")).toBe("19");
    expect(majorOf("19.3.0")).toBe("19");
    expect(majorOf(">=22.12.0")).toBe("22");
  });

  it("answers nothing for something that is not a version", () => {
    expect(majorOf(undefined)).toBeNull();
    expect(majorOf("")).toBeNull();
    expect(majorOf("latest")).toBeNull();
  });
});

describe("deciding that node_modules is behind", () => {
  it("names the package, what is there, and what was wanted", () => {
    expect(staleMajors({ react: "^19.3.0" }, { react: "18.3.1" })).toEqual([
      "react 18 installed, 19 expected",
    ]);
  });

  it("says nothing when the majors agree", () => {
    // A patch or a minor behind is ordinary between installs and not worth a
    // word; only a major produces failures that make no sense.
    expect(staleMajors({ react: "^19.3.0" }, { react: "19.0.0" })).toEqual([]);
    expect(staleMajors({ next: "^16.3.5" }, { next: "16.0.1" })).toEqual([]);
  });

  it("reports every package that is behind, not just the first", () => {
    const behind = staleMajors(
      { react: "^19.3.0", "react-dom": "^19.3.0", next: "^16.3.5" },
      { react: "18.3.1", "react-dom": "18.3.1", next: "14.2.0" },
    );
    expect(behind).toHaveLength(3);
  });

  it("stays quiet about a package that is not installed at all", () => {
    // `resolveBin` already says that, and says it better, for the package the
    // caller actually asked to run.
    expect(staleMajors({ react: "^19.3.0" }, {})).toEqual([]);
  });

  it("ignores a package this repository does not pin a major for", () => {
    expect(staleMajors({}, { react: "18.3.1" })).toEqual([]);
  });

  it("is quiet on this checkout, which is correctly installed", () => {
    const wanted = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).dependencies;
    expect(staleMajors(wanted, installedMajors())).toEqual([]);
  });
});

describe("where the warning is wired in", () => {
  it("runs before anything this repository shells out to", () => {
    // Both entry points, because the launcher spawns and the npm scripts run.
    for (const fn of ["function runBin", "function spawnBin"]) {
      const body = source.slice(source.indexOf(fn), source.indexOf(fn) + 400);
      expect(body, `${fn} should check`).toContain("warnIfInstallIsStale()");
    }
  });

  it("checks once per process rather than once per command", () => {
    expect(source).toContain("if (installChecked) return;");
  });

  it("warns rather than refuses", () => {
    // A wrong hint must not be the thing that stops somebody working.
    const fn = source.slice(source.indexOf("function warnIfInstallIsStale"));
    expect(fn.slice(0, 900)).not.toMatch(/process\.exit|throw new Error/);
  });
});

describe("the missing DATABASE_URL", () => {
  it("names the command that was skipped, not the line of the schema", () => {
    expect(prisma).toContain("npm run setup");
    expect(prisma).toContain("DATABASE_URL is not set");
  });

  it("is checked before the client is built, so nothing queries first", () => {
    const guard = prisma.indexOf("requireDatabaseUrl()");
    const client = prisma.indexOf("new PrismaClient(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(client);
  });
});
