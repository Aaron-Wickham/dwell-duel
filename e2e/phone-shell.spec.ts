import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

const ROUTES = ['/', '/markets', '/bets', '/tasks', '/feed', '/leaderboard', '/settings', '/how-it-works', '/how-it-works/rules']

test.describe('phone shell', () => {
  for (const route of ROUTES) {
    test(`${route} is never wider than the screen and keeps its bars on the edges`, async ({ page }) => {
      await page.goto(route)
      const banner = page.getByRole('banner')
      await expect(banner).toBeVisible()

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)

      const tabBar = page.getByRole('navigation', { name: 'Primary' })
      const box = await tabBar.boundingBox()
      expect(box).not.toBeNull()
      expect(Math.round(box!.y + box!.height)).toBe(812)
      expect(Math.round(box!.x)).toBe(0)
      expect(Math.round(box!.width)).toBe(375)
    })
  }

  // D6 (#402): a browser tab can pinch-zoom; only the installed app locks it (StandaloneZoomLock,
  // which Playwright can't reach: it has no standalone mode).
  test('a browser tab leaves zoom on', async ({ page }) => {
    await page.goto('/markets')
    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content).not.toContain('maximum-scale')
    expect(content).not.toContain('user-scalable')
    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe('auto')
  })
})
