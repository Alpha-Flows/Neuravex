#!/usr/bin/env node

/**
 * The line that fails the build: a high or critical advisory in what ships.
 *
 * This replaces a bare `npm audit --omit=dev --audit-level=…`, which has no
 * way to say "this one, for this reason, while this mitigation holds" — so
 * the only options it offers are block everything or lower the bar, and a
 * project carrying one known advisory ends up lowering the bar.
 *
 * The rule here says what it means:
 *
 *   - Any advisory at or above SEVERITY_FLOOR against a production dependency
 *     fails the build.
 *   - Except the ones written down in ACCEPTED below, by advisory id — not by
 *     package. A *new* advisory in an already-accepted package still fails,
 *     which is the whole point of keeping a gate rather than dropping the
 *     floor.
 *   - An accepted advisory is only skipped while its mitigation still holds.
 *     Each entry carries a `holds()` that re-checks the thing that makes it
 *     survivable, so the exception lapses in the commit that breaks it rather
 *     than whenever somebody next reads the list.
 *   - An entry whose advisory no longer appears fails too, with a note to
 *     delete it. An allowlist nobody prunes eventually hides something.
 *
 * The floor was `critical` while the out-of-support Next 14 line made `high`
 * undrawable. Next 16 closed that, and `npm audit --omit=dev` now reports
 * nothing at any severity — which is the moment to raise a bar, rather than
 * when something is already failing against it.
 *
 * Everything below the floor is reported by the step before this one and
 * blocks nothing. That part was always the intent.
 */

const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/** npm's severities, weakest first. Anything it does not name sorts below all. */
const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

/**
 * How bad an advisory has to be to stop a release.
 *
 * `high` rather than `critical`: the difference between the two is often which
 * way a scorer rounded, and a high-severity remote read in what ships is not
 * something to carry quietly. `moderate` is deliberately not the floor — it
 * would gate on denial-of-service findings in build tooling and teach people
 * to skip the check.
 */
const SEVERITY_FLOOR = "high";

/** True when `severity` is at or above the floor. */
function blocksAtFloor(severity, floor = SEVERITY_FLOOR) {
  const rank = SEVERITY_ORDER.indexOf(severity);
  return rank >= 0 && rank >= SEVERITY_ORDER.indexOf(floor);
}

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
 * Every advisory in the report at or above the floor, by id.
 *
 * `npm audit --json` groups by package, and each package's `via` mixes
 * advisory objects with the names of packages it is vulnerable *through*. The
 * same advisory shows up under every package that reaches it, so this
 * de-duplicates on the GitHub advisory id in the URL.
 */
function blockingAdvisories(report, floor = SEVERITY_FLOOR) {
  const found = new Map();
  const packages = (report && report.vulnerabilities) || {};

  for (const entry of Object.values(packages)) {
    for (const via of (entry && entry.via) || []) {
      // A string here names a package, not an advisory.
      if (!via || typeof via !== "object") continue;
      if (!blocksAtFloor(via.severity, floor)) continue;
      const id = advisoryId(via.url);
      if (!id || found.has(id)) continue;
      found.set(id, {
        id,
        package: via.name || entry.name,
        title: via.title || "",
        severity: via.severity,
      });
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
function assess(report, accepted = ACCEPTED, floor = SEVERITY_FLOOR) {
  const found = blockingAdvisories(report, floor);
  const blocking = [];
  const skipped = [];
  const stale = [];

  for (const entry of accepted) {
    const advisory = found.get(entry.id);
    if (!advisory) {
      stale.push(entry);
      continue;
    }
    found.delete(entry.id);
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

  for (const advisory of found.values()) blocking.push(advisory);

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
    say(`BLOCKING  ${entry.severity ?? "?"}  ${entry.id}  ${entry.package} — ${entry.title}`);
    if (entry.lapsed) {
      say(`          This was accepted under ${entry.lapsed.finding}, but the mitigation no longer holds:`);
      say(`          ${entry.lapsed.mitigation}`);
    }
  }

  if (result.ok) {
    say(
      result.skipped.length > 0
        ? `\nNothing unaccepted at ${SEVERITY_FLOOR} or above in what ships (${result.skipped.length} accepted).`
        : `\nNothing at ${SEVERITY_FLOOR} or above in what ships.`,
    );
    return 0;
  }
  say(`\nA ${SEVERITY_FLOOR}-or-above advisory in a production dependency is a build failure.`);
  return 1;
}

module.exports = { ACCEPTED, SEVERITY_FLOOR, advisoryId, blocksAtFloor, blockingAdvisories, assess };

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`[neuravex] ${err.message}\n`);
    process.exit(2);
  }
}
