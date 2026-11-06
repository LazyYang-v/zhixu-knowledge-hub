import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/auth-e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:15174",
    channel: "chromium",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: [
    {
      command: "npx tsx scripts/test-auth-server.ts",
      url: "http://127.0.0.1:18788/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 15174 --strictPort",
      url: "http://127.0.0.1:15174",
      env: { ZHIXU_API_TARGET: "http://127.0.0.1:18788" },
      reuseExistingServer: false,
    },
  ],
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-auth-report" }],
  ],
});
