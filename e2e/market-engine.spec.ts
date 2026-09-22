import { test, expect } from '@playwright/test'

test('create a market, place a bet, and resolve it as admin', async ({ page }) => {
  await page.goto('/markets/new')

  await page.getByLabel('Title').fill('Will it rain tomorrow?')
  const closeAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
  await page.getByLabel('Close time').fill(closeAt)
  await page.getByRole('button', { name: 'Create market' }).click()

  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  await expect(page.getByRole('heading', { name: 'Will it rain tomorrow?' })).toBeVisible()

  await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
  await page.getByPlaceholder('Amount (DC)').fill('20')
  await page.getByRole('button', { name: 'Place bet' }).click()

  await expect(page.getByText('20 DC on Yes')).toBeVisible()

  // The seeded session is promoted to admin (e2e/global-setup.ts), so it
  // can resolve immediately without waiting for close_at.
  await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(page.getByText('Status: resolved')).toBeVisible()
})
