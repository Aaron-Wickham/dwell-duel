import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('Add flips the row and shows the slip button before the server answers', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the optimistic pick land?')
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  // Hold the add request until the optimistic state has been checked, so the check can't race
  // the server. A server action is a POST to the page's own URL with a Next-Action header.
  const marketPath = new URL(page.url()).pathname
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let intercepted = false
  await page.route(
    (url) => url.pathname === marketPath,
    async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        intercepted = true
        await held
      }
      await route.continue()
    },
  )

  const outcomes = page.getByRole('region', { name: 'Outcomes' })
  const yesRow = outcomes.getByRole('listitem').filter({ hasText: 'Yes' })
  await expect(page.getByRole('button', { name: /^Slip \(/ })).toHaveCount(0)

  await yesRow.getByRole('button', { name: 'Add Yes to slip' }).click()

  await expect(yesRow.getByText('In your slip')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Slip (1)', exact: true })).toBeVisible()
  await expect.poll(() => intercepted).toBe(true)
  await expect(page.getByText('Added to your slip.')).toHaveCount(0)

  // Record whether the row ever flashes back to its Add button while the server state lands.
  await yesRow.evaluate((row) => {
    const flags = window as unknown as { flashedBack: boolean }
    flags.flashedBack = false
    new MutationObserver(() => {
      if (row.textContent?.includes('Add Yes to slip')) flags.flashedBack = true
    }).observe(row, { childList: true, subtree: true, characterData: true })
  })
  release()

  // The row and the slip button are the confirmation; adding a pick never toasts (#392).
  await expect(page.getByRole('button', { name: 'Remove Yes from slip' })).toBeVisible()
  await expect(page.getByText('Added to your slip.')).toHaveCount(0)
  await expect(outcomes.getByText('In your slip')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Slip (1)', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { flashedBack: boolean }).flashedBack)).toBe(false)
  await page.unrouteAll()
})
