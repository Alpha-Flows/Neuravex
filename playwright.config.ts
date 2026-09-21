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
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:3939",
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
    url: "http://127.0.0.1:3939",
    reuseExistingServer: true,
    cwd: __dirname,
    timeout: 120000,
    env: { PORT: "3939" },
  },
});
