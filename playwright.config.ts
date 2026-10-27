import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/acceptance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5000 },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/acceptance.json" }]],
  use: {
    baseURL: process.env.TEST_BASE_URL,
    browserName: "chromium",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
