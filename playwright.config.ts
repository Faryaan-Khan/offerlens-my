import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build (`vite preview`), so they
 * exercise exactly what ships to GitHub Pages.
 *
 * Locally, point Playwright at an existing Chromium instead of downloading one:
 *   PW_CHROMIUM_PATH=/path/to/chrome npx playwright test
 * In CI the workflow runs `npx playwright install --with-deps chromium` and
 * leaves PW_CHROMIUM_PATH unset, so the bundled browser is used.
 */
const PORT = 4173;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'en-MY',
    timezoneId: 'Asia/Kuala_Lumpur',
    colorScheme: 'light',
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
      grepInvert: /@mobile-only/,
    },
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      // Only the flows that matter most on a phone; the rest is covered on desktop.
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
