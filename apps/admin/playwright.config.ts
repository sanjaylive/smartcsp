import { defineConfig, devices } from '@playwright/test';

const PORT = 3611;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Smoke suite against the real API (default http://localhost:4610) and Mailpit.
 * The admin app is started with `next start` (run `pnpm build` first) unless one is already
 * listening on :3611, or E2E_WEB_COMMAND overrides it (e.g. "pnpm dev").
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/super-admin.json' },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.E2E_WEB_COMMAND ?? 'pnpm start',
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { API_URL: process.env.API_URL ?? 'http://localhost:4610' },
      },
});
