#!/usr/bin/env node

/**
 * The line that fails the build: a critical advisory in what ships.
 *
 * This replaces a bare `npm audit --omit=dev --audit-level=critical`, which
 * could never pass and so was never a gate. The CI workflow already said as
 * much in its own comment — "the Next.js 14 line is out of support and cannot
 * go green until the migration lands" — and then gated on exactly the
 * advisories it had just described as a standing report. The check was added
 * in the same round that broke `npm ci`, so it had never once run to the end
 * and nobody had seen the contradiction.
 *
 * A check that cannot pass is not a check. People stop reading it, and the
 * next real critical arrives into a build that was already red.
 *
 * So the rule is narrower and says what it means:
 *
 *   - Any critical advisory against a production dependency fails the build.
 *   - Except the ones written down in ACCEPTED below, by advisory id — not by
 *     package. A *new* critical against `next` still fails, which is the whole
 *     point of keeping the gate rather than lowering `--audit-level`.
 *   - An accepted advisory is only skipped while its mitigation still holds.
 *     Each entry carries a `holds()` that re-checks the thing that makes it
 *     survivable. Turn the image optimizer back on and the exception stops
 *     applying, in the same commit, without anyone remembering to come here.
 *   - An entry whose advisory no longer appears fails too, with a note to
 *     delete it. An allowlist nobody prunes eventually hides something.
 *
 * Everything below critical is reported by the step before this one and
 * blocks nothing. That part was always the intent.
 */

const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/**
 * Critical advisories we ship with knowingly.
 *
 * Empty, and the aim is to keep it that way. It held two once — the
 * unauthenticated RCEs against the out-of-support `next` 14 line
 * (GHSA-p293-qw3h-jr36 and GHSA-2xp9-vwfh-vxw4), accepted on the strength of
 * the loopback bind and the image optimizer being off. The Next 16 upgrade
 * closed both, and this gate is what said so: it refuses an entry whose
 * advisory has stopped being reported, so the list was pruned because the
 * check failed rather than because somebody remembered.
 *
 * An entry needs an `id`, the `package` and `title` it belongs to, the finding
 * in docs/SECURITY_REVIEW.md that accepted it, the `mitigation` that makes it
 * survivable, and a `holds()` that re-checks that mitigation on every run. If
 * you cannot write the last two honestly, the advisory is not accepted — it is
 * unfixed, and this is not the place to record that.
 */
/**
 * @typedef {object} AcceptedAdvisory
 * @property {string} id            GHSA id, which is what the allowlist matches on.
 * @property {string} package       The package the advisory is against.
 * @property {string} title         Its headline, for the CI log.
 * @property {string} finding       The docs/SECURITY_REVIEW.md finding that accepted it.
 * @property {string} mitigation    Why it is survivable here, in a sentence.
 * @property {() => boolean} holds  Re-checks that mitigation on every run.
 */

/** @type {AcceptedAdvisory[]} */
const ACCEPTED = [];

/**
 * Every critical advisory in the report, by id.
 *
 * `npm audit --json` groups by package, and each package's `via` mixes
 * advisory objects with the names of packages it is vulnerable *through*. The
 * same advisory shows up under every package that reaches it, so this
 * de-duplicates on the GitHub advisory id in the URL.
 */
function criticalAdvisories(report) {
  const found = new Map();
  const packages = (report && report.vulnerabilities) || {};

  for (const entry of Object.values(packages)) {
    for (const via of (entry && entry.via) || []) {
      // A string here names a package, not an advisory.
      if (!via || typeof via !== "object") continue;
      if (via.severity !== "critical") continue;
      const id = advisoryId(via.url);
      if (!id || found.has(id)) continue;
      found.set(id, { id, package: via.name || entry.name, title: via.title || "" });
    }
  }
  return found;
}

/** The GHSA id out of an advisory URL, or null when it is not one. */
function advisoryId(url) {
  if (typeof url !== "string") return null;
  const match = /\/(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})\b/i.exec(url);
  return match ? match[1] : null;
}

/**
 * What the report means: what blocks, what is accepted, and what is written
 * down but no longer real.
 */
function assess(report, accepted = ACCEPTED) {
  const criticals = criticalAdvisories(report);
  const blocking = [];
  const skipped = [];
  const stale = [];

  for (const entry of accepted) {
    const advisory = criticals.get(entry.id);
    if (!advisory) {
      stale.push(entry);
      continue;
    }
    criticals.delete(entry.id);
    let held;
    try {
      held = entry.holds() === true;
    } catch {
      // A mitigation we can no longer check is a mitigation we cannot claim.
      held = false;
    }
    if (held) skipped.push({ ...advisory, ...entry });
    else blocking.push({ ...advisory, lapsed: entry });
  }

  for (const advisory of criticals.values()) blocking.push(advisory);

  return { ok: blocking.length === 0 && stale.length === 0, blocking, skipped, stale };
}

/** `npm audit --omit=dev --json`, which exits non-zero when it finds anything. */
function runAudit() {
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (err) {
    // Findings are a non-zero exit with the report still on stdout. Anything
    // else — npm missing, a broken tree — has no report to parse and should
    // fail loudly rather than be read as "no advisories".
    if (typeof err.stdout === "string" && err.stdout.trim()) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        /* fall through */
      }
    }
    throw new Error(`could not read npm audit: ${err.message}`);
  }
}

function say(line = "") {
  process.stdout.write(`${line}\n`);
}

function main() {
  const result = assess(runAudit());

  for (const entry of result.skipped) {
    say(`accepted  ${entry.id}  ${entry.package} — ${entry.title}`);
    say(`          ${entry.finding}: ${entry.mitigation}`);
  }

  for (const entry of result.stale) {
    say(`stale     ${entry.id} is no longer reported.`);
    say(`          Delete its entry from scripts/audit-gate.js — the exception has outlived its reason.`);
  }

  for (const entry of result.blocking) {
    if (entry.lapsed) {
      say(`BLOCKING  ${entry.id}  ${entry.package} — ${entry.title}`);
      say(`          This was accepted under ${entry.lapsed.finding}, but the mitigation no longer holds:`);
      say(`          ${entry.lapsed.mitigation}`);
    } else {
      say(`BLOCKING  ${entry.id}  ${entry.package} — ${entry.title}`);
    }
  }

  if (result.ok) {
    say(
      result.skipped.length > 0
        ? `\nNo unaccepted critical advisory in what ships (${result.skipped.length} accepted).`
        : "\nNo critical advisory in what ships.",
    );
    return 0;
  }
  say("\nA critical advisory in a production dependency is a build failure.");
  return 1;
}

module.exports = { ACCEPTED, advisoryId, criticalAdvisories, assess };

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`[neuravex] ${err.message}\n`);
    process.exit(2);
  }
}
