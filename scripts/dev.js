#!/usr/bin/env node

/**
 * `npm run dev` — the development server, on loopback.
 *
 * `npm start` and the launcher were made to bind 127.0.0.1 in answer to
 * NVX-003, and the dev server was left as a bare `next dev`. Next's dev
 * server does not choose a host at all when none is given, so it listened on
 * every interface, and INSTALL.md ended its numbered install steps with that
 * command. Anyone on the same network could open the builder by IP address —
 * the Host allowlist accepts any IP literal, and a script sends no Origin to
 * refuse — and read, change and delete every site on the machine, while the
 * documentation said the port was closed.
 *
 * So the dev server takes its host from the same `serverHost()` as the other
 * two, and widening it needs HOST, with the same warning. Anything after `--`
 * still reaches `next dev`; a `-H` or `--hostname` given there is honoured, and
 * warned about in the same words when it is not loopback.
 */

const { runBin, serverHost, exposureWarning } = require("./local-bin");

const args = process.argv.slice(2);
const flag = args.findIndex((arg) => arg === "-H" || arg === "--hostname" || arg.startsWith("--hostname="));
const given = flag === -1 ? null : args[flag].startsWith("--hostname=") ? args[flag].slice("--hostname=".length) : args[flag + 1];

const { host, loopback } = serverHost(given);

if (!loopback) exposureWarning(host).forEach((line) => process.stdout.write(`[neuravex] ${line}\n`));

try {
  runBin("next", given ? ["dev", ...args] : ["dev", "-H", host, ...args]);
} catch (err) {
  if (err.status === undefined) process.stderr.write(`[neuravex] ${err.message}\n`);
  process.exit(err.status ?? 1);
}
