import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const launcher = readFileSync(join(ROOT, "electron", "server.js"), "utf8");
const setup = readFileSync(join(ROOT, "scripts", "first-run.js"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("a downloaded copy can start itself", () => {
  it("has the launcher do the first-run setup before serving anything", () => {
    // Neither .env nor the database is in a download, so `npm install &&
    // npm run desktop` used to start a server whose every page threw.
    expect(setup).toContain("module.exports");
    expect(launcher).toContain('require("../scripts/first-run")');
    // Inside main(), so this measures the call sites and not the definitions.
    const main = launcher.slice(launcher.indexOf("async function main()"));
    const setupCall = main.indexOf("firstRun()");
    const buildCall = main.indexOf("ensureBuilt()");
    expect(setupCall).toBeGreaterThan(-1);
    expect(buildCall).toBeGreaterThan(-1);
    expect(setupCall).toBeLessThan(buildCall);
  });

  it("offers the same steps on their own, for anyone using the dev server", () => {
    expect(pkg.scripts.setup).toBe("node scripts/first-run.js");
  });

  it("never applies a schema change that would cost data", () => {
    // `prisma db push` refuses rather than dropping a column; it must not be
    // talked out of that on a machine holding someone's only copy.
    expect(setup).not.toContain("--accept-data-loss");
    expect(setup).not.toContain("--force-reset");
  });

  it("keeps its own state file out of the repository", () => {
    const ignored = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(ignored).toContain("prisma/.neuravex-state.json");
  });
});

describe("the documented way in", () => {
  it("is the two commands the launcher actually supports", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const quickStart = readme.slice(readme.indexOf("## Quick start"), readme.indexOf("## Using the editor"));
    expect(quickStart).toContain("npm install");
    expect(quickStart).toContain("npm run desktop");
    // The steps the launcher now does itself should not be asked of a reader.
    expect(quickStart).not.toContain("cp .env.example .env");
  });
});
