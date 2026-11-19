import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173/platform-survival/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-dev-shm-usage",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      testMatch: "game.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "series-flows",
      testMatch: "series.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        baseURL: "http://127.0.0.1:5174/platform-survival/",
      },
    },
  ],
  webServer: [
    {
      command: "pnpm preview --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173/platform-survival/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174/platform-survival/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
