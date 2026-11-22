import { defineConfig } from "@playwright/test";

const PORT = 3107;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  // every test in parallel, three at a time: one file run in order took about 9 minutes. One retry for a test that
  // ran out of time while every core was busy; a retried pass is reported as "flaky", never hidden.
  fullyParallel: true,
  workers: 3,
  retries: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
