import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { placeSolo } from './slip'

test('a market with a bet shows its chart, on the market page and its list card', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the charts render?')
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await placeSolo(page, 'Yes', 10)
  await expect(page.getByRole('region', { name: 'Bets' }).getByText('10 DC on Yes')).toBeVisible()

  // A new market's price (0102): 10 DC on Yes moves it from 50% to 59%. A yes/no chart draws only
  // Yes, and says how it moved (#391).
  const chart = page.getByRole('slider', { name: 'Yes rose from 50% to 59% since it opened.' })
  await expect(chart).toBeVisible()
  // Read by keyboard (#418): Home steps back to the opening chance, End to now.
  await chart.focus()
  await page.keyboard.press('Home')
  await expect(chart).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByTestId('chart-announcer')).toHaveText(/: Yes 50%$/)
  await page.keyboard.press('End')
  await expect(page.getByTestId('chart-announcer')).toHaveText('Now: Yes 59%')

  await page.goto('/markets')
  const card = page.getByRole('article').filter({ hasText: 'Will the charts render?' })
  await expect(card.getByRole('img', { name: 'Yes rose from 50% to 59% since it opened.' })).toBeVisible()
  await expect(card.getByText('59%', { exact: true })).toBeVisible()
})
