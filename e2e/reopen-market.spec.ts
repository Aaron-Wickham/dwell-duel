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
    test('reopen a closed market from More actions, confirming the new close time, and see it in Edit history', async ({ page }) => {
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
      const outcomes = page.getByRole('region', { name: 'Outcomes' })
      await expect(outcomes.getByText('Betting has closed. Waiting for a result.')).toBeVisible()

      const moreActions = page.getByRole('button', { name: 'More actions' })
      await moreActions.click()
      await page.getByRole('menuitem', { name: 'Reopen', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Reopen market' })
      await dialog.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 3 * 60 * 60 * 1000)))
      await dialog.getByRole('button', { name: 'Reopen market' }).click()
      const confirm = page.getByRole('alertdialog', { name: 'Reopen this market?' })
      await expect(confirm).toContainText('Members can bet until')
      await confirm.getByRole('button', { name: 'Reopen market' }).click()

      await expect(outcomes.getByRole('button', { name: 'Add Yes to slip' })).toBeVisible()
      await moreActions.click()
      await expect(page.getByRole('menuitem', { name: 'Reopen', exact: true })).toHaveCount(0)
      await page.getByRole('menuitem', { name: 'Edit history' }).click()
      await expect(page.getByRole('dialog', { name: 'Edit history' }).getByText(/^Close time moved from/)).toBeVisible()
    })
  })
}
