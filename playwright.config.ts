import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // A stray `test.only` would otherwise let CI pass green while skipping
  // every other test — fail loudly there instead. No effect locally.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
