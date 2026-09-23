import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE_PATH } from './e2e/global-setup'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Every spec file shares the one seeded, admin-promoted session
  // global-setup.ts injects -- including that profile's coin balance.
  // Under parallel workers, one file's in-flight balance mutation (e.g. a
  // bet debited but not yet resolved) can be read mid-flight by another
  // file's assertion, producing a transient, order-dependent value
  // (reproduced: coin-economy.spec.ts's final balance check failed
  // intermittently under parallel workers even after removing every
  // test's dependency on an exact balance value, because the race is in
  // the underlying data, not any one assertion). The suite is small
  // enough (five sub-second tests) that serial execution costs nothing
  // and removes the race entirely.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    storageState: STORAGE_STATE_PATH,
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
