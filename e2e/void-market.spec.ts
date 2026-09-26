import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('void a market through the confirmation dialog', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the potluck run out of rolls?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const trigger = page.getByRole('button', { name: 'Void this market', exact: true })
  const dialog = page.getByRole('alertdialog', { name: 'Void this market?' })

  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)
  }

  // An alert dialog needs an answer: pressing the backdrop doesn't dismiss it.
  await page.mouse.click(5, 5)
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.getByText('Status: open')).toBeVisible()

  await trigger.click()
  await dialog.getByRole('button', { name: 'Void market', exact: true }).click()

  await expect(page.getByText('Status: voided')).toBeVisible()
  // The void card unmounts on success; the toast must survive that.
  await expect(page.getByText('Market voided.')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(trigger).toHaveCount(0)
})
