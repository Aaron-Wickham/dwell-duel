import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { addToSlip, openSlip } from './slip'
import { backers, clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

test('build a two-leg parlay in the slip, place it, and win it', async ({ page }) => {
  const bob = await clientForEmail('bob@example.com')
  // Other specs spend Bob's balance (clawback leaves him at 20 DC); these two markets take 40.
  const { data: bobProfile, error: bobErr } = await serviceClient().from('profiles').select('id, balance').eq('email', 'bob@example.com').single()
  if (bobErr) throw bobErr
  if (bobProfile.balance < 40) {
    const { error } = await serviceClient().rpc('apply_coin_transaction', { p_profile_id: bobProfile.id, p_amount: 40 - bobProfile.balance, p_type: 'test_top_up' })
    if (error) throw error
  }
  const marketUrls: string[] = []

  for (const title of ['Parlay leg one?', 'Parlay leg two?']) {
    await page.goto('/markets/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
    await page.getByRole('button', { name: 'Create market' }).click()
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
    marketUrls.push(page.url())

    // Bob bets 5 on Yes and 15 on No, Backer1 20 on Yes and Backer2 20 on No: 60 DC from three
    // other members, over the parlay floor (0074). A leg's odds are set at close from that real
    // money, seed left out: Yes is 60 / 25 = 2.40×. It's their money, not the parlay-builder's,
    // because a leg's odds leave out the bettor's own stakes.
    const marketId = new URL(page.url()).pathname.split('/').at(-1)!
    const { data: outcomes } = await serviceClient().from('market_outcomes').select('id, label').eq('market_id', marketId)
    const [backer1, backer2] = (await backers()).map((b) => b.client)
    for (const [client, label, amount] of [
      [bob, 'Yes', 5],
      [bob, 'No', 15],
      [backer1, 'Yes', 20],
      [backer2, 'No', 20],
    ] as const) {
      const { error } = await client.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomes!.find((o) => o.label === label)!.id, p_amount: amount })
      if (error) throw error
    }
    await page.reload()
    await expect(page.getByRole('region', { name: 'Bets' }).getByText('15 DC on No')).toBeVisible()
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
  // Estimates until each market closes.
  await expect(parlay.getByText('~5.76×')).toBeVisible()
  await parlay.getByLabel('Stake (DC)').fill('5')
  await expect(parlay.getByText('Pays ~28 DC if every pick wins')).toBeVisible()
  await sheet.getByRole('button', { name: 'Place 1 bet · 5 DC' }).click()
  await expect(page.getByText('Placed a 2-leg parlay at ~5.76×.').first()).toBeVisible()

  // The old Parlays page lands on My bets, where the parlay sits beside solo bets.
  await page.goto('/parlays')
  await expect(page).toHaveURL(/\/bets$/)
  const placed = page.getByRole('listitem', { name: 'Parlay · 2 picks' }).filter({ hasText: 'Parlay leg one?' }).first()
  await expect(placed.getByText('~5.76×')).toBeVisible()
  await expect(placed.getByText('~28 DC')).toBeVisible()
  // The parlay's chip and both of its legs.
  await expect(placed.getByText('Open', { exact: true })).toHaveCount(3)

  // The card opens the parlay's breakdown, and the way back is My bets.
  await placed.getByRole('link', { name: 'Parlay · 2 picks' }).click()
  await expect(page).toHaveURL(/\/parlays\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Parlay · 2 picks' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Picks' }).getByRole('link', { name: 'Parlay leg one?' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'How it adds up' }).getByText('= ~5.76×')).toBeVisible()
  await page.getByRole('link', { name: 'My bets' }).first().click()
  await expect(page).toHaveURL(/\/bets$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)

  // The seeded session is an admin, so it can resolve before close_at.
  for (const url of marketUrls) {
    await page.goto(url)
    await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
    await page.getByLabel('Why did this outcome win?').fill('Checked against the recording')
    await page.getByRole('button', { name: 'Resolve market' }).click()
    await page.getByRole('button', { name: 'Confirm outcome' }).click()
    await expect(page.getByText('Resolved', { exact: true })).toBeVisible()
  }

  await page.goto('/bets')
  await page.getByRole('navigation', { name: 'My bets sections' }).getByRole('link', { name: 'Settled' }).click()
  await expect(page).toHaveURL(/\/bets\?tab=settled$/)
  const won = page.getByRole('listitem', { name: 'Parlay · 2 picks' }).filter({ hasText: 'Parlay leg one?' }).first()
  await expect(won.getByText('Won 28 DC')).toBeVisible()
  await won.getByRole('link', { name: 'Parlay · 2 picks' }).click()
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('Won 28 DC')
  await expect(page.getByRole('region', { name: 'Picks' }).getByText('Resolved: Yes')).toHaveCount(2)
  // Each leg's odds are set now, so the sum has no estimates left.
  await expect(page.getByRole('region', { name: 'How it adds up' }).getByText('= 5.76×')).toBeVisible()
})
