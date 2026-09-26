import { test, expect } from '@playwright/test'

// playwright.config.ts blocks service workers for every other spec; this one runs the real one.
test.use({ serviceWorkers: 'allow' })

test('offline: the banner shows and clears live, a navigation falls back to the offline page, and Try again recovers', async ({
  context,
  page,
  request,
}) => {
  const worker = await request.get('/sw.js')
  expect(worker.status()).toBe(200)
  expect(worker.headers()['cache-control']).toBe('no-cache, no-store, must-revalidate')

  await page.goto('/')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await navigator.serviceWorker.ready
        return Boolean(navigator.serviceWorker.controller)
      }),
    )
    .toBe(true)

  const banner = page.getByText('You’re offline — changes will send when you reconnect.')
  await expect(banner).toHaveCount(0)
  await context.setOffline(true)
  await expect(banner).toBeVisible()

  // useOffline() flips back live, with no navigation: proves the banner isn't stuck once the
  // browser's own connectivity events say the connection is back.
  await context.setOffline(false)
  await expect(banner).toHaveCount(0)
  await context.setOffline(true)

  // "/" was already visited above, live and network-first. Offline, a fresh navigation to it
  // still goes to the (failing) network rather than replaying a cached copy of that visit.
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/markets')
  await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeVisible()
  await expect(page).toHaveURL(/\/markets$/)

  await context.setOffline(false)
  await page.getByRole('link', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible()
  await expect(banner).toHaveCount(0)
})
