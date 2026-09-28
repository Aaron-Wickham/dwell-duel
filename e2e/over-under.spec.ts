import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('create an over/under, reword it, and resolve it from the actual number', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Minutes the sermon runs')
  await page.getByLabel('Over/Under').check()
  await page.getByLabel('Line').fill('42.5')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()

  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  await expect(page.getByText('Over/Under 42.5')).toBeVisible()

  await page.getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit market' })
  await dialog.getByLabel('Title').fill('Minutes the Sunday sermon runs')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Minutes the Sunday sermon runs' })).toBeVisible()
  await page.getByText(/^Edited/).click()
  await expect(page.getByText('“Minutes the sermon runs”')).toBeVisible()

  await page.getByLabel('Actual result').fill('47')
  await expect(page.getByText('Over 42.5 wins.')).toBeVisible()
  await page.getByLabel('Why did this outcome win?').fill('Timed it from the livestream')
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(page.getByText('Actual: 47 · Winning outcome: Over 42.5')).toBeVisible()
})
