#!/usr/bin/env node

/**
 * `npm start` — the production server, on loopback.
 *
 * `next start` binds every interface when it is not told otherwise, and the
 * plain `"start": "next start"` script never told it otherwise. Neuravex has
 * no sign-in: on a shared network that made every site on the machine
 * readable, editable and deletable by anyone who could reach the port, and a
 * script does not even trip the Origin check because a script simply sends no
 * Origin. So the bind address is explicit here, and widening it needs HOST.
 */

const { runBin, serverHost, exposureWarning } = require("./local-bin");

const { host, loopback } = serverHost();
const port = process.env.PORT || "3000";

if (!loopback) exposureWarning(host).forEach((line) => process.stdout.write(`[neuravex] ${line}\n`));

try {
  runBin("next", ["start", "-H", host, "-p", String(port)]);
} catch (err) {
  if (err.status === undefined) process.stderr.write(`[neuravex] ${err.message}\n`);
  process.exit(err.status ?? 1);
}
