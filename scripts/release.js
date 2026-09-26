#!/usr/bin/env node

/**
 * What a release tag has to agree with before anything is built from it.
 *
 * Neuravex had never been tagged, and the first attempt at a checklist for it
 * found three things that each said a different version: the launchers, the
 * MCP server and `package.json`. They read one file now, but a tag is typed
 * by hand, and nothing stopped `v0.2.0` being pushed onto a `package.json`
 * that still said 0.1.0, or a release going out whose changelog section was
 * still called "Unreleased" — a customer would then install a build that
 * reported one version and was described under none.
 *
 * So the release workflow asks this first, and stops on any disagreement:
 *
 *   node scripts/release.js verify v0.1.0   the tag, package.json and the changelog agree
 *   node scripts/release.js notes 0.1.0     print that version's changelog section, for the release page
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The `## [version]` heading line in a changelog, or null. */
function changelogHeading(text, version) {
  const match = new RegExp(`^## \\[${escape(version)}\\].*$`, "m").exec(text);
  return match ? match[0] : null;
}

/** What a changelog says under a version's heading, up to the next version's, trimmed; null when there is no such heading. */
function changelogSection(text, version) {
  const heading = changelogHeading(text, version);
  if (!heading) return null;
  const start = text.indexOf(heading) + heading.length;
  const rest = text.slice(start);
  const next = /^## \[/m.exec(rest);
  // Link references at the foot of the file belong to no section.
  const body = (next ? rest.slice(0, next.index) : rest).replace(/^\[[^\]]+\]:\s*\S+\s*$/gm, "");
  return body.trim();
}

/** Everything wrong with releasing `tag`; an empty list when it can go. */
function releaseProblems({ tag, version, changelog }) {
  const problems = [];
  if (tag !== `v${version}`) {
    problems.push(`The tag is ${tag || "(none)"}, but package.json says ${version}. Tag v${version}, or change the version first.`);
  }
  const heading = changelogHeading(changelog, version);
  if (!heading) {
    problems.push(`CHANGELOG.md has no "## [${version}]" section. Rename [Unreleased] to it.`);
  } else {
    if (!/ - \d{4}-\d{2}-\d{2}\s*$/.test(heading)) {
      problems.push(`The changelog heading "${heading}" has no date. Write it as "## [${version}] - YYYY-MM-DD", the day of the tag.`);
    }
    if (!changelogSection(changelog, version)) problems.push(`The changelog section for ${version} is empty.`);
  }
  return problems;
}

function readRelease() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  return { version, changelog };
}

module.exports = { changelogHeading, changelogSection, releaseProblems, readRelease };

if (require.main === module) {
  const [command, arg] = process.argv.slice(2);
  const { version, changelog } = readRelease();
  if (command === "verify") {
    const problems = releaseProblems({ tag: arg, version, changelog });
    for (const problem of problems) process.stderr.write(`[release] ${problem}\n`);
    if (problems.length) process.exit(1);
    process.stdout.write(`[release] ${arg} matches package.json and CHANGELOG.md.\n`);
  } else if (command === "notes") {
    const section = changelogSection(changelog, arg || version);
    if (section === null) {
      process.stderr.write(`[release] CHANGELOG.md has no section for ${arg || version}.\n`);
      process.exit(1);
    }
    process.stdout.write(`${section}\n`);
  } else {
    process.stderr.write("Usage: node scripts/release.js verify <tag> | notes [version]\n");
    process.exit(2);
  }
}
