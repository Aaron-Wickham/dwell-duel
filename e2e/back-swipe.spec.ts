import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

// Real touches through Chromium's input pipeline (CDP), so passive listeners, touch-action,
// cancelability and native scrolling behave as they do on a phone.
async function drag(page: Page, from: [number, number], to: [number, number], holdMs = 0) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] })
  for (let step = 1; step <= 10; step++) {
    const x = from[0] + ((to[0] - from[0]) * step) / 10
    const y = from[1] + ((to[1] - from[1]) * step) / 10
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await page.waitForTimeout(16)
  }
  // Holding still before lifting leaves no release velocity, so only the distance decides.
  await page.waitForTimeout(holdMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('on a phone, an edge swipe goes back, and a short or vertical drag does not', async ({ page }) => {
  // A deep link has no in-app history, so the swipe goes to the page's logical parent.
  await page.goto('/markets/new')
  const form = page.getByRole('heading', { level: 1, name: 'Create market' })
  await expect(form).toBeVisible()

  await drag(page, [5, 400], [80, 400], 200)
  await expect(page.locator('[data-swiping]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/markets\/new$/)

  // A shorter viewport guarantees this form has content to scroll into, so the drag proves
  // native scrolling actually happened rather than merely not triggering the swipe.
  await page.setViewportSize({ width: 375, height: 400 })
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await drag(page, [5, 300], [30, 50])
  await page.waitForTimeout(400)
  const scrollAfter = await page.evaluate(() => window.scrollY)
  expect(scrollAfter).toBeGreaterThan(scrollBefore)
  await expect(page.locator('[data-swiping]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/markets\/new$/)
  await page.setViewportSize({ width: 375, height: 812 })

  await drag(page, [5, 400], [220, 410], 200)
  await expect(page).toHaveURL(/\/markets$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible()

  // With in-app history the swipe is a real back, so forward returns to the form.
  await page.getByRole('link', { name: 'Create market', exact: true }).first().click()
  await expect(form).toBeVisible()
  await drag(page, [5, 400], [220, 410], 200)
  await expect(page).toHaveURL(/\/markets$/)
  await page.goForward()
  await expect(form).toBeVisible()
})
