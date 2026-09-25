import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('a bet shows up in the feed and on the bettor\'s profile', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Social layer market')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
  await page.getByPlaceholder('Amount (DC)').fill('5')
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByText('Alice — 5 DC on Yes (you)')).toBeVisible()

  const sentence = 'Alice bet 5 DC on Yes in Social layer market'

  await page.goto('/feed')
  await expect(page.getByRole('listitem').filter({ hasText: sentence }).first()).toBeVisible()

  await page.goto('/leaderboard')
  await page.getByRole('link', { name: 'Alice' }).click()
  await expect(page).toHaveURL(/\/members\/[0-9a-f-]+/)
  await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: sentence }).first()).toBeVisible()
})

test('an unknown member id shows a 404', async ({ page }) => {
  const response = await page.goto('/members/00000000-0000-4000-8000-000000000000')
  expect(response?.status()).toBe(404)
})
