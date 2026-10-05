import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { addToSlip, openSlip } from './slip'

test.use({ viewport: { width: 375, height: 812 } })

test('the slip button follows the member everywhere, and one tap places every solo bet in it', async ({ page }) => {
  for (const title of ['Sheet leg one?', 'Sheet leg two?', 'Sheet solo?']) {
    await page.goto('/markets/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Category', { exact: true }).fill('Testing')
    await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
    await page.getByRole('button', { name: 'Create market' }).click()
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
    // A pick joins the slip even on an outcome nobody has bet on yet.
    await addToSlip(page, 'Yes')
  }

  const trigger = page.getByRole('button', { name: 'Slip (3)', exact: true })
  await expect(trigger).toBeVisible()

  // The trigger floats above the fixed tab bar rather than behind it.
  const tabBar = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
  const triggerBox = await trigger.boundingBox()
  expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(tabBar!.y)

  // It's on every signed-in page, on desktop too.
  await page.goto('/feed')
  await expect(trigger).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(trigger).toBeVisible()
  await page.setViewportSize({ width: 375, height: 812 })

  // The sheet is modal (A11Y-01, #392): the page behind is inert while it's open, so Tab pressed
  // the moment it opens, before it has taken focus, and Tab at key-repeat speed both stay inside it.
  await trigger.click()
  for (let i = 0; i < 10; i++) await page.keyboard.press('Tab')
  let sheet = page.getByRole('dialog', { name: 'Your slip' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator(':focus')).toHaveCount(1)
  await expect(page.locator('#app-shell')).toHaveAttribute('inert', '')
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 40; i++) await page.keyboard.press(key)
    await expect(sheet.locator(':focus')).toHaveCount(1)
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press(key)
      await expect(sheet.locator(':focus')).toHaveCount(1)
    }
  }
  // Any pick can be switched to Parlay; one that can't be a leg yet says why once it is (0074).
  await expect(sheet.getByRole('button', { name: 'Parlay' }).first()).toBeEnabled()
  // Every Remove control is a full 44px target.
  for (const remove of await sheet.getByRole('button', { name: /^Remove / }).all()) {
    const box = await remove.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('#app-shell')).not.toHaveAttribute('inert')
  await expect(sheet).toHaveCount(0)
  await expect(trigger).toBeFocused()

  sheet = await openSlip(page)
  const stakes = sheet.getByLabel('Stake (DC)')
  await expect(stakes).toHaveCount(3)
  // A quick-stake chip fills in its own pick's stake.
  const chips = sheet.getByRole('group', { name: /^Quick stakes for Yes, / })
  await expect(chips).toHaveCount(3)
  await chips.first().getByRole('button', { name: '10', exact: true }).click()
  await expect(stakes.first()).toHaveValue('10')
  await expect(sheet.getByRole('button', { name: 'Place 3 bets · 10 DC' })).toBeVisible()
  for (const [i, amount] of ['4', '6', '10'].entries()) await stakes.nth(i).fill(amount)
  await sheet.getByRole('button', { name: 'Place 3 bets · 20 DC' }).click()
  await expect(page.getByText('Placed 3 solo bets.').first()).toBeVisible()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Slip \(/ })).toHaveCount(0)

  await page.goto('/bets')
  const open = page.getByRole('region', { name: 'Open' })
  for (const title of ['Sheet leg one?', 'Sheet leg two?', 'Sheet solo?']) {
    await expect(open.getByRole('link', { name: title })).toBeVisible()
  }
})
