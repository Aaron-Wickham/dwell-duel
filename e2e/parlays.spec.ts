import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('build a two-leg parlay from market pages, place it, and win it', async ({ page }) => {
  const marketUrls: string[] = []

  for (const title of ['Parlay leg one?', 'Parlay leg two?']) {
    await page.goto('/markets/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
    await page.getByRole('button', { name: 'Create market' }).click()
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
    marketUrls.push(page.url())

    await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
    await page.getByPlaceholder('Amount (DC)').fill('5')
    await page.getByRole('button', { name: 'Place bet' }).click()
    await expect(page.getByText('5 DC on Yes')).toBeVisible()

    await page.getByRole('combobox').first().selectOption({ label: 'No' })
    await page.getByPlaceholder('Amount (DC)').fill('15')
    await page.getByRole('button', { name: 'Place bet' }).click()
    await expect(page.getByText('15 DC on No')).toBeVisible()

    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
    await expect(page.getByText('In your slip')).toBeVisible()
  }

  await page.goto('/parlays')
  await expect(page.getByText('Combined: 16.00×')).toBeVisible()
  await page.getByLabel('Stake (DC)').fill('5')
  await expect(page.getByText('Potential payout: 80 DC')).toBeVisible()
  await page.getByRole('button', { name: 'Place parlay' }).click()

  await expect(page.getByText('Parlay placed at 16.00× — potential payout 80 DC.')).toBeVisible()
  await expect(page.getByText('Pending — 5 DC at 16.00× — pays 80 DC if every pick wins').first()).toBeVisible()

  // The seeded session is an admin, so it can resolve before close_at.
  for (const url of marketUrls) {
    await page.goto(url)
    await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
    await page.getByRole('button', { name: 'Confirm outcome' }).click()
    await expect(page.getByText('Status: resolved')).toBeVisible()
  }

  await page.goto('/parlays')
  await expect(page.getByText('Won — 5 DC at 16.00× — paid 80 DC').first()).toBeVisible()
})
