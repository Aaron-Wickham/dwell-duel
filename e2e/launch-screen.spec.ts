import { test, expect } from '@playwright/test'

test('a browser tab never shows the launch screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).not.toHaveAttribute('data-launch')
  await expect(page.locator('.launch-screen')).toBeHidden()
})

test('an installed app shows it on a cold start only, and it clears by itself', async ({ page }) => {
  // Emulate display-mode: standalone before any of the page's scripts run.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (query: string) =>
      query === '(display-mode: standalone)' ? ({ ...real(query), matches: true, media: query } as MediaQueryList) : real(query)
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-launch', '')
  await expect(page.locator('.launch-screen')).toBeVisible()
  await expect(page.locator('.launch-screen')).toBeHidden({ timeout: 1_500 })

  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-launch')
})
