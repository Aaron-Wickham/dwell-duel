import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('Duplicate opens Create market filled in from the market, a week on, and creates a new market from it', async ({ page }) => {
  const close = new Date(Date.now() + 60 * 60 * 1000)
  close.setSeconds(0, 0)
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Who reads the lesson this week?')
  await page.getByLabel('Description').fill('Whoever the rota says')
  await page.getByLabel('Multiple choice').check()
  await page.getByRole('textbox', { name: 'Outcome 1' }).fill('Pat')
  await page.getByRole('textbox', { name: 'Outcome 2' }).fill('Sam')
  await page.getByRole('button', { name: 'Add outcome' }).click()
  await page.getByRole('textbox', { name: 'Outcome 3' }).fill('Lee')
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(close))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)
  const originalUrl = page.url()
  const marketId = originalUrl.split('/').pop()!

  // Edit, Share and Duplicate sit in one row that still fits a 320px screen.
  await page.setViewportSize({ width: 320, height: 720 })
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await page.getByRole('link', { name: 'Duplicate' }).click()
  await expect(page).toHaveURL(`/markets/new?from=${marketId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Create market' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Who reads the lesson this week?')
  await expect(page.getByLabel('Description')).toHaveValue('Whoever the rota says')
  await expect(page.getByLabel('Multiple choice')).toBeChecked()
  // In the order the market shows them: outcomes made together share a timestamp, then sort by label.
  await expect(page.getByRole('textbox', { name: 'Outcome 1' })).toHaveValue('Lee')
  await expect(page.getByRole('textbox', { name: 'Outcome 2' })).toHaveValue('Pat')
  await expect(page.getByRole('textbox', { name: 'Outcome 3' })).toHaveValue('Sam')
  // The same local time, one week on.
  const nextWeek = new Date(close)
  nextWeek.setDate(nextWeek.getDate() + 7)
  await expect(page.getByLabel('Close time')).toHaveValue(localDateTimeString(nextWeek))

  await page.getByLabel('Title').fill('Who reads the lesson next week?')
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)
  expect(page.url()).not.toBe(originalUrl)
  await expect(page.getByRole('heading', { level: 1, name: 'Who reads the lesson next week?' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Outcomes' })).toContainText('Lee')
})

test('an unknown id opens a blank form', async ({ page }) => {
  await page.goto('/markets/new?from=00000000-0000-4000-8000-000000000000')
  await expect(page.getByLabel('Title')).toHaveValue('')
  await expect(page.getByLabel('Binary (Yes/No)')).toBeChecked()
  await expect(page.getByLabel('Close time')).toHaveValue('')
})
