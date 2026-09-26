import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test.use({ viewport: { width: 375, height: 812 } })

test('on a phone, the slip drawer on a market page holds the picks and places the parlay', async ({ page }) => {
  for (const title of ['Drawer leg one?', 'Drawer leg two?']) {
    await page.goto('/markets/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
    await page.getByRole('button', { name: 'Create market' }).click()
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

    for (const label of ['Yes', 'No']) {
      await page.getByRole('combobox').first().selectOption({ label })
      await page.getByPlaceholder('Amount (DC)').fill('1')
      await page.getByRole('button', { name: 'Place bet' }).click()
      await expect(page.getByRole('region', { name: 'Bets' }).getByText(`1 DC on ${label}`)).toBeVisible()
    }

    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
    await expect(page.getByRole('region', { name: 'Outcomes' }).getByText('In your slip')).toBeVisible()
  }
  // Task 5's toasts survive their forms: "Add to parlay" has just turned into "In your slip".
  await expect(page.getByText('Bet placed.').first()).toBeVisible()
  await expect(page.getByText('Added to your slip.').first()).toBeVisible()

  const trigger = page.getByRole('button', { name: 'Slip (2)', exact: true })
  await expect(trigger).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Stake (DC)')).toHaveCount(0)

  // Desktop keeps /parlays: from md up there is no trigger.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(trigger).toBeHidden()
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(trigger).toBeVisible()

  // The trigger floats above the fixed tab bar rather than behind it.
  const tabBar = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
  const triggerBox = await trigger.boundingBox()
  expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(tabBar!.y)

  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Your slip' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Drawer leg one?' })).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Drawer leg two?' })).toBeVisible()
  await expect(sheet.getByText('Combined: 4.00×')).toBeVisible()
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    await expect(sheet.locator(':focus')).toHaveCount(1)
  }

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await sheet.getByLabel('Stake (DC)').fill('1')
  await sheet.getByRole('button', { name: 'Place parlay' }).click()
  await expect(sheet.getByText('Parlay placed at 4.00× — potential payout 4 DC.')).toBeVisible()
  await expect(sheet.getByText('Your slip is empty.')).toBeVisible()

  await sheet.getByRole('button', { name: 'Close slip' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Slip \(/ })).toHaveCount(0)
})
