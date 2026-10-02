import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'
import { localDateTimeString } from './local-date-time'

// #326: the creator reopens a closed market by giving it a new close time, after confirming, on a
// phone and on a desktop.
for (const [name, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport })
    test('reopen a closed market, confirming the new close time, and see it in Edited', async ({ page }) => {
      const title = `Reopen check ${Date.now()}`
      await page.goto('/markets/new')
      await page.getByLabel('Title').fill(title)
      await page.getByLabel('Category', { exact: true }).fill('Testing')
      await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
      await page.getByRole('button', { name: 'Create market' }).click()
      await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)
      const marketId = page.url().split('/').pop()!

      const { error } = await serviceClient()
        .from('markets')
        .update({ close_at: new Date(Date.now() - 60_000).toISOString() })
        .eq('id', marketId)
      if (error) throw error
      await page.reload()
      await expect(page.getByRole('heading', { name: 'No more bets' })).toBeVisible()

      await page.getByRole('button', { name: 'Reopen', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Reopen market' })
      await dialog.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 3 * 60 * 60 * 1000)))
      await dialog.getByRole('button', { name: 'Reopen market' }).click()
      const confirm = page.getByRole('alertdialog', { name: 'Reopen this market?' })
      await expect(confirm).toContainText('Members can bet until')
      await confirm.getByRole('button', { name: 'Reopen market' }).click()

      await expect(page.getByRole('heading', { name: 'Place a bet' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toHaveCount(0)
      await page.getByText(/^Edited/).click()
      await expect(page.getByText(/^Close time moved from/)).toBeVisible()
    })
  })
}
