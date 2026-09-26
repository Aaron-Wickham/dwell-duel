import { test, expect, type Request } from '@playwright/test'

// Next fetches a route's loading state ahead of time (a prefetch, marked Next-Router-Prefetch), and
// fetches the page itself on click (RSC, no prefetch header). Holding only the second one keeps the
// destination loading for as long as the test needs, whatever the database's speed.
const isLeaderboard = (url: URL) => url.pathname === '/leaderboard'

function isPageFetch(request: Request) {
  const headers = request.headers()
  return headers['rsc'] === '1' && !('next-router-prefetch' in headers)
}

function isLoadingStatePrefetch(request: Request) {
  const headers = request.headers()
  return headers['next-router-prefetch'] === '1' && !('next-router-segment-prefetch' in headers)
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a slow navigation shows the destination skeleton before its content', async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(isLeaderboard, async (route) => {
      if (isPageFetch(route.request())) await held
      await route.continue()
    })
    // Registered before goto: a link in view is prefetched as soon as the page is idle.
    const prefetched = page.waitForResponse(
      (response) => isLeaderboard(new URL(response.url())) && isLoadingStatePrefetch(response.request()),
    )

    await page.goto('/')
    const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Leaderboard', exact: true })
    await link.hover()
    await prefetched

    await link.click()
    const skeleton = page.locator('[data-skeleton="leaderboard"]')
    await expect(skeleton).toBeVisible()
    await expect(page).toHaveURL(/\/leaderboard$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Leaderboard' })).toHaveCount(0)

    release()
    await expect(page.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeVisible()
    await expect(skeleton).toHaveCount(0)
  })
})
