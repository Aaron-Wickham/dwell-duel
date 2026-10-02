import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { placeSolo } from './slip'

test('create a market, place a bet, and resolve it as admin', async ({ page }) => {
  await page.goto('/markets/new')

  await page.getByLabel('Title').fill('Will it rain tomorrow?')
  const closeAt = localDateTimeString(new Date(Date.now() + 60 * 60 * 1000))
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(closeAt)
  await page.getByRole('button', { name: 'Create market' }).click()

  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  await expect(page.getByRole('heading', { level: 1, name: 'Will it rain tomorrow?' })).toBeVisible()

  await placeSolo(page, 'Yes', 20)

  await expect(page.getByRole('region', { name: 'Bets' }).getByText('20 DC on Yes')).toBeVisible()

  // The seeded session is promoted to admin (e2e/global-setup.ts), so it
  // can resolve immediately without waiting for close_at.
  await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
  await page.getByLabel('Why did this outcome win?').fill('The forecast said 90% and it poured')
  await page.getByLabel('Link').fill('https://example.com/weather-report')
  await page.getByRole('button', { name: 'Add link' }).click()
  await page.getByRole('button', { name: 'Resolve market' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Resolve this market?' })).toContainText('Yes wins.')
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(page.getByText('Resolved', { exact: true })).toBeVisible()
  const why = page.getByRole('region', { name: 'Why it resolved this way' })
  await expect(why.getByText('The forecast said 90% and it poured')).toBeVisible()
  await expect(why.getByRole('link', { name: 'example.com/weather-report' })).toHaveAttribute('href', 'https://example.com/weather-report')
})

test('a create-market error keeps what was typed', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the typing survive?')
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() - 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()

  await expect(page.getByText('Choose a close time in the future.')).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Will the typing survive?')
})
