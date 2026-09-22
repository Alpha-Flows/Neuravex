import { describe, it, expect } from "vitest";
import { ACCEPTED, SEVERITY_FLOOR, advisoryId, blocksAtFloor, blockingAdvisories, assess } from "./audit-gate.js";

/**
 * The gate decides whether a critical advisory stops a release, so the way it
 * can fail worst is quietly: an inverted condition, a de-duplication that eats
 * a real finding, an allowlist that matches by package and waves through the
 * next critical in the same one. Those are what these cover.
 */

interface Via {
  name?: string;
  severity?: string;
  title?: string;
  url?: string;
}

/** A report in the shape `npm audit --json` produces. */
const report = (packages: Record<string, (Via | string)[]>) => ({
  vulnerabilities: Object.fromEntries(
    Object.entries(packages).map(([name, via]) => [name, { name, via }]),
  ),
});

const advisory = (id: string, over: Partial<Via> = {}): Via => ({
  name: "next",
  severity: "critical",
  title: "Something bad",
  url: `https://github.com/advisories/${id}`,
  ...over,
});

const entry = (id: string, holds: () => boolean) => ({
  id,
  package: "next",
  title: "",
  finding: "NVX-000",
  mitigation: "",
  holds,
});

describe("reading an audit report", () => {
  it("takes the advisory id out of the URL, and nothing else", () => {
    expect(advisoryId("https://github.com/advisories/GHSA-p293-qw3h-jr36")).toBe("GHSA-p293-qw3h-jr36");
    expect(advisoryId("https://example.com/not-an-advisory")).toBeNull();
    expect(advisoryId(undefined as unknown as string)).toBeNull();
  });

  it("ignores the package names npm mixes into `via`", () => {
    // A string in `via` is a package this one is vulnerable *through*, not an
    // advisory. Treating one as an advisory would invent a finding.
    const found = blockingAdvisories(report({ next: ["postcss", advisory("GHSA-aaaa-bbbb-cccc")] }));
    expect([...found.keys()]).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });

  it("leaves everything below the floor alone", () => {
    for (const severity of ["info", "low", "moderate"]) {
      const found = blockingAdvisories(report({ next: [advisory("GHSA-aaaa-bbbb-cccc", { severity })] }));
      expect(found.size, `${severity} should not block`).toBe(0);
    }
  });

  it("takes everything at or above it", () => {
    for (const severity of ["high", "critical"]) {
      const found = blockingAdvisories(report({ next: [advisory("GHSA-aaaa-bbbb-cccc", { severity })] }));
      expect(found.size, `${severity} should block`).toBe(1);
    }
  });

  it("keeps the severity, so the log says which line was crossed", () => {
    const found = blockingAdvisories(report({ next: [advisory("GHSA-aaaa-bbbb-cccc", { severity: "high" })] }));
    expect(found.get("GHSA-aaaa-bbbb-cccc")?.severity).toBe("high");
  });

  it("does not block on a severity npm has never heard of", () => {
    // An unknown string must not sort above the floor by accident — that would
    // turn a parsing change upstream into a build that cannot pass.
    const found = blockingAdvisories(report({ next: [advisory("GHSA-aaaa-bbbb-cccc", { severity: "spicy" })] }));
    expect(found.size).toBe(0);
  });

  it("counts an advisory once even when several packages reach it", () => {
    const found = blockingAdvisories(
      report({ next: [advisory("GHSA-aaaa-bbbb-cccc")], "next-mdx": [advisory("GHSA-aaaa-bbbb-cccc")] }),
    );
    expect(found.size).toBe(1);
  });

  it("survives a report with nothing in it", () => {
    expect(blockingAdvisories({ vulnerabilities: {} }).size).toBe(0);
    expect(blockingAdvisories(undefined).size).toBe(0);
  });
});

describe("the severity floor", () => {
  it("is `high`, and `critical` is above it", () => {
    expect(SEVERITY_FLOOR).toBe("high");
    expect(blocksAtFloor("critical")).toBe(true);
    expect(blocksAtFloor("high")).toBe(true);
    expect(blocksAtFloor("moderate")).toBe(false);
  });

  it("can be moved, so raising or lowering it is one argument", () => {
    const one = report({ next: [advisory("GHSA-aaaa-bbbb-cccc", { severity: "moderate" })] });
    expect(blockingAdvisories(one, "moderate").size).toBe(1);
    expect(blockingAdvisories(one, "critical").size).toBe(0);
    expect(assess(one, [], "moderate").ok).toBe(false);
    expect(assess(one, [], "critical").ok).toBe(true);
  });
});

describe("what fails the build", () => {
  it("passes when there is no critical at all", () => {
    expect(assess(report({}), []).ok).toBe(true);
  });

  it("fails on a critical nobody wrote down", () => {
    const result = assess(report({ next: [advisory("GHSA-new0-new0-new0")] }), []);
    expect(result.ok).toBe(false);
    expect(result.blocking.map((b) => b.id)).toEqual(["GHSA-new0-new0-new0"]);
  });

  it("passes an accepted one while its mitigation holds", () => {
    const result = assess(
      report({ next: [advisory("GHSA-aaaa-bbbb-cccc")] }),
      [entry("GHSA-aaaa-bbbb-cccc", () => true)],
    );
    expect(result.ok).toBe(true);
    expect(result.skipped.map((s) => s.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });

  it("fails the same one the moment its mitigation stops holding", () => {
    // Turning the image optimizer back on has to break the build in the commit
    // that does it, not whenever somebody next reads the allowlist.
    const result = assess(
      report({ next: [advisory("GHSA-aaaa-bbbb-cccc")] }),
      [entry("GHSA-aaaa-bbbb-cccc", () => false)],
    );
    expect(result.ok).toBe(false);
    expect(result.blocking[0].lapsed).toBeTruthy();
  });

  it("treats a mitigation it cannot check as one that does not hold", () => {
    const result = assess(
      report({ next: [advisory("GHSA-aaaa-bbbb-cccc")] }),
      [entry("GHSA-aaaa-bbbb-cccc", () => { throw new Error("config moved"); })],
    );
    expect(result.ok).toBe(false);
  });

  it("still fails on a second critical in an accepted package", () => {
    // The allowlist is keyed by advisory, not by package. Accepting one
    // finding against `next` must not wave through the next one.
    const result = assess(
      report({ next: [advisory("GHSA-aaaa-bbbb-cccc"), advisory("GHSA-new0-new0-new0")] }),
      [entry("GHSA-aaaa-bbbb-cccc", () => true)],
    );
    expect(result.ok).toBe(false);
    expect(result.blocking.map((b) => b.id)).toEqual(["GHSA-new0-new0-new0"]);
  });

  it("fails on an entry whose advisory is gone, so the list gets pruned", () => {
    const result = assess(report({}), [entry("GHSA-aaaa-bbbb-cccc", () => true)]);
    expect(result.ok).toBe(false);
    expect(result.stale.map((s) => s.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });
});

describe("the exceptions this repository actually ships", () => {
  it("has none — and the aim is to keep it that way", () => {
    // It held the two `next` 14 criticals until the Next 16 upgrade closed
    // them. If this ever grows again, the assertions below say what an entry
    // has to carry to be worth believing.
    expect(ACCEPTED).toEqual([]);
  });

  it("would make any entry name its finding, its mitigation, and re-check it", () => {
    for (const a of ACCEPTED as { id: string; finding: string; mitigation: string; holds: () => boolean }[]) {
      expect(a.id).toMatch(/^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/i);
      expect(a.finding).toMatch(/^NVX-\d+$/);
      expect(a.mitigation.length).toBeGreaterThan(40);
      expect(typeof a.holds).toBe("function");
      // The real assertion, for whenever there is an entry: an exception is
      // only worth anything while the thing that makes it survivable is true.
      expect(a.holds(), `${a.id} mitigation no longer holds`).toBe(true);
    }
  });
});
