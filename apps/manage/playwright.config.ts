import { defineConfig, devices } from "@playwright/test";

import { APP_ORIGIN, APP_PORT } from "./tests/ui/app-origin";


export default defineConfig({
  testDir: "./tests/ui",
  outputDir: "./.playwright/results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: "line",
  use: { baseURL: APP_ORIGIN, timezoneId: "America/New_York", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // macOS 把 ~/Library/Application Support/Firefox 纳入隐私保护时，终端派生的 Firefox 读不到
    // profiles.ini 而无权启动；PW_FIREFOX_EXECUTABLE 指到带独立 Name/Vendor branding 的 wrapper 绕过。
    { name: "firefox", use: { ...devices["Desktop Firefox"], launchOptions: { executablePath: process.env.PW_FIREFOX_EXECUTABLE } } },
  ],
  webServer: {
    command: process.env.FRONTEND_UI_DEV === "1"
      ? `FRONTEND_UI_TEST=1 node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${APP_PORT} --strictPort`
      : `node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${APP_PORT} --strictPort --outDir .playwright/app`,
    url: `${APP_ORIGIN}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
