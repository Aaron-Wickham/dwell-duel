import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { addToSlip, openSlip } from './slip'

test('removing the last pick shows the empty slip and a way to markets', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Empty slip market?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  await addToSlip(page, 'Yes')

  const sheet = await openSlip(page)
  await sheet.getByRole('button', { name: 'Remove Yes, Empty slip market?' }).click()
  await expect(sheet.getByText('Your slip is empty.')).toBeVisible()
  await expect(sheet.getByText('Add picks from any open market.')).toBeVisible()

  await sheet.getByRole('link', { name: 'Browse markets' }).click()
  await expect(page).toHaveURL(/\/markets$/)
  await expect(page.getByRole('button', { name: /^Slip \(/ })).toHaveCount(0)
})
