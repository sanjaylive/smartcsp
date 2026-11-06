import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite. Needs the API (API_URL, default http://localhost:4610), Mailpit and the dev
 * infrastructure running. The web app is started with `next start` unless one is already on 3610.
 */
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3610';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.WEB_URL
    ? undefined
    : {
        command: 'pnpm start',
        url: `${WEB_URL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
