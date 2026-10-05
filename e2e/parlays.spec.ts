import { test, expect } from '@playwright/test'
import { addToSlip, openSlip } from './slip'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'
import { formatOdds, lmsrParlayQuote } from '../lib/parlays/odds'

test('build a two-leg parlay in the slip, place it, and win it', async ({ page }) => {
  // Other specs spend Alice's balance; this parlay takes 5.
  const { data: alice, error: aliceErr } = await serviceClient().from('profiles').select('id, balance').eq('email', 'alice@example.com').single()
  if (aliceErr) throw aliceErr
  if (alice.balance < 5) {
    const { error } = await serviceClient().rpc('apply_coin_transaction', { p_profile_id: alice.id, p_amount: 5 - alice.balance, p_type: 'test_top_up' })
    if (error) throw error
  }
  const bob = await clientForEmail('bob@example.com')
  const stamp = Date.now()
  const titles = [`Parlay leg one ${stamp}?`, `Parlay leg two ${stamp}?`]
  const marketUrls: string[] = []

  for (const title of titles) {
    const { data, error } = await bob.rpc('create_market_v3', {
      p_title: title,
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    if (error) throw error
    const url = `/markets/${(data as { market_id: string }).market_id}`
    marketUrls.push(url)
    await page.goto(url)
    await addToSlip(page, 'Yes')
  }

  const sheet = await openSlip(page)
  for (const title of titles) {
    await sheet.getByRole('group', { name: `Bet type for Yes, ${title}` }).getByRole('button', { name: 'Parlay' }).click()
  }
  const parlay = sheet.getByRole('region', { name: 'Parlay · 2 picks' })
  await parlay.getByLabel('Stake (DC)').fill('5')

  // Both markets open at 50%: each leg buys 2.5 DC of shares, and the payout is fixed when placed.
  const even = { q: [0, 0], liquidity: 50, index: 0 }
  const quote = lmsrParlayQuote([even, even], 5)
  const multiplier = `${formatOdds(quote.multiplierBp)}×`
  await expect(parlay.getByText(`Pays ${quote.payout} DC (${multiplier}) if every pick wins`)).toBeVisible()
  await sheet.getByRole('button', { name: 'Place 1 bet · 5 DC' }).click()
  await expect(page.getByText(`Placed a 2-leg parlay paying ${quote.payout} DC (${multiplier}). Bets are final.`).first()).toBeVisible()

  // The old Parlays page lands on My bets, where the parlay sits beside solo bets.
  await page.goto('/parlays')
  await expect(page).toHaveURL(/\/bets$/)
  const placed = page.getByRole('listitem', { name: 'Parlay · 2 picks' }).filter({ hasText: titles[0] }).first()
  await expect(placed.getByText(multiplier, { exact: true })).toBeVisible()
  await expect(placed.getByText(`${quote.payout} DC`, { exact: true })).toBeVisible()
  // Both legs; the Open tab already says the parlay is open, so it carries no chip of its own (#387).
  await expect(placed.getByText('Open', { exact: true })).toHaveCount(2)

  // The card opens the parlay's breakdown, and the way back is My bets.
  await placed.getByRole('link', { name: 'Parlay · 2 picks' }).click()
  await expect(page).toHaveURL(/\/parlays\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Parlay · 2 picks' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Picks' }).getByRole('link', { name: titles[0] })).toBeVisible()
  await expect(page.getByRole('region', { name: 'How it adds up' }).getByText(`= ${multiplier}`)).toBeVisible()
  await page.getByRole('link', { name: 'My bets' }).first().click()
  await expect(page).toHaveURL(/\/bets$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)

  // The seeded session is an admin, so it can resolve before close_at, though it holds a stake.
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
  const won = page.getByRole('listitem', { name: 'Parlay · 2 picks' }).filter({ hasText: titles[0] }).first()
  await expect(won.getByText(`Won ${quote.payout} DC`)).toBeVisible()
  await won.getByRole('link', { name: 'Parlay · 2 picks' }).click()
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText(`Won ${quote.payout} DC`)
  await expect(page.getByRole('region', { name: 'Picks' }).getByText('Resolved: Yes')).toHaveCount(2)
  await expect(page.getByRole('region', { name: 'How it adds up' }).getByText(`= ${multiplier}`)).toBeVisible()
})
