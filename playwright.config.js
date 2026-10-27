import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node --env-file-if-exists=.env server/index.js',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '4173',
      HOST: '127.0.0.1',
      DATABASE_PATH: './test-results/browser.db',
      DISABLE_RATE_LIMIT: 'true',
      NODE_ENV: 'test',
      ADMIN_TOKEN: 'test-only-administrator-key-not-for-deployment',
    },
  },
});
