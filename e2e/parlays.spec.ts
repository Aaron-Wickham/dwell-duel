import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { addToSlip, openSlip, placeSolo } from './slip'

test('build a two-leg parlay in the slip, place it, and win it', async ({ page }) => {
  const marketUrls: string[] = []

  for (const title of ['Parlay leg one?', 'Parlay leg two?']) {
    await page.goto('/markets/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
    await page.getByRole('button', { name: 'Create market' }).click()
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
    marketUrls.push(page.url())

    // 5 on Yes and 15 on No, on top of each market's 20 DC seed per outcome: Yes pays 60 / 25 = 2.40×.
    await placeSolo(page, 'Yes', 5)
    await expect(page.getByText('5 DC on Yes')).toBeVisible()
    await placeSolo(page, 'No', 15)
    await expect(page.getByText('15 DC on No')).toBeVisible()
  }

  for (const url of marketUrls) {
    await page.goto(url)
    await addToSlip(page, 'Yes')
  }

  const sheet = await openSlip(page)
  for (const title of ['Parlay leg one?', 'Parlay leg two?']) {
    await sheet.getByRole('group', { name: `Bet type for Yes, ${title}` }).getByRole('button', { name: 'Parlay' }).click()
  }
  const parlay = sheet.getByRole('region', { name: 'Parlay · 2 picks' })
  await expect(parlay.getByText('5.76×')).toBeVisible()
  await parlay.getByLabel('Stake (DC)').fill('5')
  await expect(parlay.getByText('Pays 28 DC if every pick wins')).toBeVisible()
  await sheet.getByRole('button', { name: 'Place 1 bet · 5 DC' }).click()
  await expect(page.getByText('Placed a 2-leg parlay at 5.76×.').first()).toBeVisible()

  // The old Parlays page lands on My bets, where the parlay sits beside solo bets.
  await page.goto('/parlays')
  await expect(page).toHaveURL(/\/bets$/)
  const placed = page.getByRole('listitem', { name: 'Parlay · 2 picks' }).filter({ hasText: 'Parlay leg one?' }).first()
  await expect(placed.getByText(/5 DC at 5\.76× · pays 28 DC if every pick wins/)).toBeVisible()
  await expect(placed.getByText('Pending', { exact: true })).toBeVisible()

  // The seeded session is an admin, so it can resolve before close_at.
  for (const url of marketUrls) {
    await page.goto(url)
    await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
    await page.getByLabel('Why did this outcome win?').fill('Checked against the recording')
    await page.getByRole('button', { name: 'Confirm outcome' }).click()
    await expect(page.getByText('Status: resolved')).toBeVisible()
  }

  await page.goto('/bets')
  await page.getByRole('navigation', { name: 'Bet status' }).getByRole('link', { name: 'Settled' }).click()
  await expect(page).toHaveURL(/\/bets\?tab=settled$/)
  const won = page.getByRole('listitem', { name: 'Parlay · 2 picks' }).filter({ hasText: 'Parlay leg one?' }).first()
  await expect(won.getByText('Won 28 DC')).toBeVisible()
})
