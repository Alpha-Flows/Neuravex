#!/usr/bin/env node

/**
 * `npm run build` — the production bundle, and a note of what it was built
 * from.
 *
 * The note is the point. `scripts/build-state.js` decides on every launch
 * whether the bundle matches the source, and it can only do that if something
 * recorded the source as it was at build time. If only the launcher recorded
 * it, then the flow the documentation actually recommends — `npm run build &&
 * npm run desktop` — would build once by hand, find nothing recorded, and
 * build again on the way up.
 *
 * So a hand build and a launcher build are the same event, and this is it.
 */

const { runBin } = require("./local-bin");
const { recordBuild } = require("./build-state");

function runBuild() {
  runBin("next", ["build"]);
  // After the build, not before: a fingerprint recorded for a build that then
  // failed would make the next launch skip the rebuild it needs.
  recordBuild();
}

module.exports = { runBuild };

if (require.main === module) {
  try {
    runBuild();
  } catch (err) {
    if (err.status === undefined) process.stderr.write(`[neuravex] ${err.message}\n`);
    process.exit(err.status ?? 1);
  }
}
