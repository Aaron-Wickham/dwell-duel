import { test, expect, type Page } from '@playwright/test'

// The document's own location: what the address bar shows once the offline page has loaded.
const pathname = (page: Page) => page.evaluate(() => location.pathname)

// playwright.config.ts blocks service workers for every other spec; this one runs the real one.
test.use({ serviceWorkers: 'allow' })

test('offline: the banner shows and clears live, a tab tap answers at once, a navigation falls back to the offline page, which reloads on reconnect', async ({
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

  const banner = page.getByRole('status').getByText('Offline. Reconnecting…')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(banner).toHaveCount(0)
  const headingTop = (await heading.boundingBox())!.y
  await context.setOffline(true)
  await expect(banner).toBeVisible()
  // The banner never covers the page's title (#401): the page moves down by exactly its height.
  const bannerBox = (await banner.locator('xpath=..').boundingBox())!
  await expect.poll(async () => (await heading.boundingBox())!.y).toBeCloseTo(headingTop + bannerBox.height, 0)
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height)

  // useOffline() flips back live, with no navigation: proves the banner isn't stuck once the
  // browser's own connectivity events say the connection is back.
  await context.setOffline(false)
  await expect(banner).toHaveCount(0)
  await context.setOffline(true)

  // A tab tap while offline answers straight away rather than hanging (ST-7).
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tasks', exact: true }).click()
  await expect(page.getByText('You’re offline. That page opens once you’re back online.')).toBeVisible({ timeout: 1_000 })

  // "/" was already visited above, live and network-first. Offline, a fresh navigation to it
  // still goes to the (failing) network rather than replaying a cached copy of that visit.
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeVisible()
  await expect.poll(() => pathname(page)).toBe('/')
  // Never a dead end: Home is a tap away as well as Try again.
  await expect(page.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/')
  // Navigating away within a few milliseconds of the offline page loading, while its requests
  // are still failing, sometimes lands on "/" again; no member taps that fast.
  await page.waitForLoadState('networkidle')

  await page.goto('/markets')
  await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeVisible()
  await expect.poll(() => pathname(page)).toBe('/markets')

  // The offline page reloads itself on the online event (ST-12).
  await context.setOffline(false)
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible()
  await expect(banner).toHaveCount(0)
})
