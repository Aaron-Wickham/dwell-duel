import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { placeSolo } from './slip'

test('create a market, place a bet, and resolve it as admin', async ({ page }) => {
  await page.goto('/markets/new')

  await page.getByLabel('Title').fill('Will it rain tomorrow?')
  const closeAt = localDateTimeString(new Date(Date.now() + 60 * 60 * 1000))
  await page.getByLabel('Close time').fill(closeAt)
  await page.getByRole('button', { name: 'Create market' }).click()

  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  await expect(page.getByRole('heading', { name: 'Will it rain tomorrow?' })).toBeVisible()

  await placeSolo(page, 'Yes', 20)

  await expect(page.getByText('20 DC on Yes')).toBeVisible()

  // The seeded session is promoted to admin (e2e/global-setup.ts), so it
  // can resolve immediately without waiting for close_at.
  await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(page.getByText('Status: resolved')).toBeVisible()
})
