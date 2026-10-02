import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('void a market through the confirmation dialog', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the potluck run out of rolls?')
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const trigger = page.getByRole('button', { name: 'Void this market', exact: true })
  const dialog = page.getByRole('alertdialog', { name: 'Void this market?' })

  // Every void says why: with no reason the browser holds the submit and no dialog opens.
  await trigger.click()
  await expect(dialog).toHaveCount(0)
  await page.getByLabel('Why void this market?').fill('The potluck was moved to next month.')

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
  await expect(page.getByText('Open', { exact: true })).toBeVisible()

  await trigger.click()
  await dialog.getByRole('button', { name: 'Void market', exact: true }).click()

  await expect(page.getByText('Voided', { exact: true })).toBeVisible()
  // The void card unmounts on success; the toast must survive that.
  await expect(page.getByText('Market voided.')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(trigger).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Why it was voided' })).toHaveText('The potluck was moved to next month.')
})
