#!/usr/bin/env node

/**
 * `npm run <something>`, without npx.
 *
 * The npm scripts used to name bare commands (`next`, `prisma`, `tsx`), which
 * npm resolves through `node_modules/.bin` — fine — and which a reader then
 * copied into an MCP configuration or a terminal somewhere else, where the
 * same name resolves through `npx` and fetches from the registry. Routing them
 * all through here means one spelling that behaves the same everywhere, and it
 * is the only place the telemetry variables have to be set: an `FOO=1 cmd`
 * prefix in a package script is a shell feature, and `npm` on Windows does not
 * run scripts in a shell that has it.
 *
 * Usage: node scripts/run-local.js <package> [args…]
 */

const { runBin } = require("./local-bin");

const [pkg, ...args] = process.argv.slice(2);

if (!pkg) {
  process.stderr.write("usage: node scripts/run-local.js <package> [args…]\n");
  process.exit(2);
}

try {
  runBin(pkg, args);
} catch (err) {
  // execFileSync already put the command's own output on this terminal; only
  // a failure to find the command at all needs anything added.
  if (err.status === undefined) process.stderr.write(`[neuravex] ${err.message}\n`);
  process.exit(err.status ?? 1);
}
