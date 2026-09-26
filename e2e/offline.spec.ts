import { test, expect } from '@playwright/test'

// playwright.config.ts blocks service workers for every other spec; this one runs the real one.
test.use({ serviceWorkers: 'allow' })

test('offline: the banner shows, a navigation falls back to the offline page, and Try again recovers', async ({
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

  await page.goto('/markets')
  await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeVisible()
  await expect(page).toHaveURL(/\/markets$/)

  await context.setOffline(false)
  await page.getByRole('link', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible()
})
