import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'
import { localDateTimeString } from './local-date-time'

test.use({ viewport: { width: 375, height: 812 } })

test('the Admin button shows a badge once a market has closed with no result', async ({ page }) => {
  const title = `Badge check ${Date.now()}`
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)
  const marketId = page.url().split('/').pop()!

  const admin = page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true })
  // Compared with the count before, not with no badge: a retry, or another spec, can leave markets
  // already waiting, and then "no badge yet" could never hold.
  const waiting = () =>
    admin.evaluate((el) => {
      const id = el.getAttribute('aria-describedby')
      return Number(/\d+/.exec((id && document.getElementById(id)?.textContent) || '0')?.[0] ?? 0)
    })
  const before = await waiting()

  // Closing is only the clock passing, but the market row changing reaches the open page live.
  // The page's live channel joins a moment after load, and a change before the join is never
  // replayed, so the row is touched again on each poll until one lands after it.
  const close = async () => {
    const { error } = await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', marketId)
    if (error) throw error
  }
  await expect
    .poll(
      async () => {
        await close()
        return waiting()
      },
      { timeout: 20_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBeGreaterThan(before)
  await expect(admin).toHaveAccessibleDescription(/\d+ waiting/)
  await expect(admin).toHaveText(/\d/)
})
