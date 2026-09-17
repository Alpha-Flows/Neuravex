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

  it("only accepts a loss that was written down and reviewed first", () => {
    // `prisma db push` refuses rather than dropping a column, which is right on
    // a machine holding someone's only copy — but it makes removing a dead
    // column unshippable. The flag is reachable, and only behind the gate.
    expect(setup).not.toContain("--force-reset");
    const flagAt = setup.indexOf("--accept-data-loss");
    const gateAt = setup.indexOf("lossIsIntentional(");
    expect(gateAt).toBeGreaterThan(-1);
    expect(flagAt).toBeGreaterThan(gateAt);
  });

  it("accepts a drop only for a column listed as intentional", async () => {
    const { lossIsIntentional } = await import("../../scripts/first-run.js");
    const drop = (table: string, column: string) =>
      `  • You are about to drop the column \`${column}\` on the \`${table}\` table, which still contains 42 non-null values.`;

    expect(lossIsIntentional(drop("Site", "theme"))).toBe(true);
    // Anything else, including a table full of someone's form submissions.
    expect(lossIsIntentional(drop("Page", "content"))).toBe(false);
    expect(lossIsIntentional("  • You are about to drop the `Submission` table, which is not empty.")).toBe(false);
    expect(lossIsIntentional(`${drop("Site", "theme")}\n  • You are about to drop the \`Revision\` table.`)).toBe(false);
    expect(lossIsIntentional("Error: something else entirely")).toBe(false);
  });

  it("regenerates the client when it changes the database", () => {
    // db push --skip-generate leaves the generated client behind, and the app
    // then queries columns the database no longer has.
    // The comment explaining why may mention it; the argument list may not.
    expect(setup).not.toMatch(/"--skip-generate"/);
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
