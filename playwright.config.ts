import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  retries: 1,
  use: {
    baseURL: "http://localhost:3939",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next dev -p 3939",
    url: "http://localhost:3939",
    reuseExistingServer: true,
    cwd: __dirname,
  },
});
