import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { changelogHeading, changelogSection, releaseProblems, readRelease } from "./release.js";

/**
 * The check the release workflow runs before it builds anything from a tag.
 * A condition turned the wrong way round here would wave through a tag that
 * disagrees with the version it ships, which is the one thing it is for.
 */

const changelog = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-10-01

### Added

- Something new.

## [0.1.0] - 2026-09-26

First release.

[Unreleased]: https://github.com/Alpha-Flows/Neuravex/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Alpha-Flows/Neuravex/releases/tag/v0.2.0
`;

describe("a changelog section", () => {
  it("is what sits under the version's heading and above the next", () => {
    expect(changelogHeading(changelog, "0.2.0")).toBe("## [0.2.0] - 2026-10-01");
    expect(changelogSection(changelog, "0.2.0")).toBe("### Added\n\n- Something new.");
  });

  it("leaves out the link references at the foot of the file", () => {
    expect(changelogSection(changelog, "0.1.0")).toBe("First release.");
  });

  it("is nothing for a version with no heading, and a dot in a version is only a dot", () => {
    expect(changelogSection(changelog, "0.3.0")).toBeNull();
    expect(changelogHeading(changelog, "0x2x0")).toBeNull();
  });
});

describe("whether a tag can be released", () => {
  it("can when the tag, package.json and the changelog agree", () => {
    expect(releaseProblems({ tag: "v0.2.0", version: "0.2.0", changelog })).toEqual([]);
  });

  it("cannot when the tag names another version", () => {
    const problems = releaseProblems({ tag: "v0.3.0", version: "0.2.0", changelog });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/package\.json says 0\.2\.0/);
  });

  it("cannot without a dated section for the version", () => {
    expect(releaseProblems({ tag: "v0.3.0", version: "0.3.0", changelog })[0]).toMatch(/no "## \[0\.3\.0\]" section/);
    const undated = changelog.replace("## [0.2.0] - 2026-10-01", "## [0.2.0]");
    expect(releaseProblems({ tag: "v0.2.0", version: "0.2.0", changelog: undated })[0]).toMatch(/has no date/);
  });

  it("cannot with an empty section", () => {
    const empty = changelog.replace("### Added\n\n- Something new.\n", "");
    expect(releaseProblems({ tag: "v0.2.0", version: "0.2.0", changelog: empty })).toEqual(["The changelog section for 0.2.0 is empty."]);
  });
});

describe("this repository", () => {
  it("is ready to tag the version package.json names", () => {
    // A version bump without its changelog section fails here, before a tag
    // is ever pushed, rather than in the release workflow after it.
    const { version, changelog: ours } = readRelease();
    expect(releaseProblems({ tag: `v${version}`, version, changelog: ours })).toEqual([]);
  });

  it("releases from a workflow that checks the tag before it builds, and attaches what it smoke-tested", () => {
    const workflow = readFileSync(join(__dirname, "..", ".github", "workflows", "release.yml"), "utf8");
    expect(workflow).toMatch(/tags:\s*\[\s*"v\*"\s*\]/);
    expect(workflow).toMatch(/node scripts\/release\.js verify "\$GITHUB_REF_NAME"/);
    expect(workflow).toMatch(/uses: \.\/\.github\/workflows\/ci\.yml/);
    expect(workflow.indexOf("scripts/smoke.js")).toBeGreaterThan(-1);
    expect(workflow.indexOf("gh release create")).toBeGreaterThan(workflow.indexOf("scripts/smoke.js"));
  });
});
