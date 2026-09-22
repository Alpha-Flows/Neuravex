import { defineConfig, devices } from "@playwright/test";

/**
 * The browser suite runs against the production server.
 *
 * It used to run `next dev`, whose Content-Security-Policy carries
 * `'unsafe-eval'` and `ws:` — so the policy every assertion saw was the loose
 * one, and nothing anywhere asserted the one customers get. The dev server
 * also re-reads `public/` on every request, which is exactly why the suite
 * never noticed that an upload 404s until a restart in production.
 *
 * `next start` needs a build; CI does one in the job. Locally,
 * `npm run build && npm run test:e2e`.
 *
 * The database, the upload directory and the port all come from
 * `scripts/e2e.js`, which is what `npm run test:e2e` runs. Nothing here
 * decides them, because a server Playwright adopts rather than starts would
 * ignore anything set here.
 */

/** One spelling of the port, so `baseURL` and `webServer` cannot disagree. */
const PORT = process.env.NEURAVEX_E2E_PORT || "3940";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60000,
  workers: 1,
  retries: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // A machine with a Chromium that Playwright did not install can say
        // where it is rather than downloading a second one.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
          : {}),
      },
    },
  ],
  webServer: {
    command: "node scripts/start.js",
    url: BASE_URL,
    // Never adopt a server this run did not start. It used to, on 3939 —
    // which is the desktop launcher's own port, so a developer with Neuravex
    // open had their running app, and their real database, taken as the
    // server under test. The specs clean up after themselves with permanent
    // deletes. A busy port is now something to explain, not to adopt.
    reuseExistingServer: false,
    cwd: __dirname,
    timeout: 120000,
    // DATABASE_URL and NEURAVEX_UPLOAD_DIR arrive through the environment
    // `scripts/e2e.js` runs this whole process in.
    env: { PORT },
  },
});
