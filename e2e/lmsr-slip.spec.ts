import { test, expect } from '@playwright/test'
import { addToSlip, openSlip } from './slip'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'
import { formatOdds, lmsrParlayQuote } from '../lib/parlays/odds'

async function topUpAlice(to: number): Promise<void> {
  const { data: alice, error: aliceErr } = await serviceClient().from('profiles').select('id, balance').eq('email', 'alice@example.com').single()
  if (aliceErr) throw aliceErr
  if (alice.balance >= to) return
  const { error } = await serviceClient().rpc('apply_coin_transaction', {
    p_profile_id: alice.id,
    p_amount: to - alice.balance,
    p_type: 'test_top_up',
  })
  if (error) throw error
}

// 0102 (#333): a new market sells shares, so the slip shows exactly what a bet pays, and the bet
// is final once placed.
test('the slip shows an exact payout on a new market, and its bet is final', async ({ page }) => {
  await topUpAlice(10)

  // Bob makes it, so the bet on screen is Alice's on someone else's market.
  const bob = await clientForEmail('bob@example.com')
  const { data, error } = await bob.rpc('create_market_v3', {
    p_title: `Fixed payout ${Date.now()}?`,
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  if (error) throw error
  await page.goto(`/markets/${(data as { market_id: string }).market_id}`)

  // A new market opens at even odds, and each row quotes 10 DC with the slip's own number (#390).
  const outcomes = page.getByRole('region', { name: 'Outcomes' })
  // Each animated figure keeps a plain-text twin for screen readers (AnimatedText); NumberFlow's own
  // fallback text can linger undrawn behind its shadow root, so count only what's visible.
  await expect(outcomes.getByText('50%', { exact: true }).filter({ visible: true })).toHaveCount(2)
  await expect(outcomes.getByText('10 DC wins 18', { exact: true })).toHaveCount(2)

  await addToSlip(page, 'Yes')
  const sheet = await openSlip(page)
  await expect(sheet.getByText('Bets are final: once placed, they can’t be cancelled.')).toBeVisible()
  await sheet.getByLabel('Stake (DC)').fill('10')
  // The spec's worked example: 10 DC buys 18.33 shares, and a share pays 1 DC.
  await expect(sheet.getByText('Pays 18 DC if it wins')).toBeVisible()
  await expect(sheet.getByText(/Pays ~/)).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Place 1 bet · 10 DC' }).click()
  await expect(page.getByText('Placed 1 solo bet. Bets are final.').first()).toBeVisible()
  await expect(sheet).toHaveCount(0)

  // The position card says what it pays, with no estimate and no Cancel.
  const position = page.getByRole('region', { name: 'Your position' })
  const bet = position.getByRole('listitem').filter({ hasText: '10 DC on Yes' })
  await expect(bet.getByText('Pays 18 DC', { exact: true })).toBeVisible()
  await expect(position.getByText('10 DC on this market · Bets are final.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Cancel your/ })).toHaveCount(0)

  // The price moved to about 59%.
  await expect(outcomes.getByText('59%', { exact: true })).toBeVisible()
})

// 0104 (#334): a parlay of new markets splits its stake across the picks, so the slip shows exactly
// what it pays, and placing fixes that figure.
test('the slip shows a parlay’s exact payout on new markets, and placing fixes it', async ({ page }) => {
  await topUpAlice(10)
  const bob = await clientForEmail('bob@example.com')
  const stamp = Date.now()
  const titles = [`Fixed leg one ${stamp}?`, `Fixed leg two ${stamp}?`]
  for (const title of titles) {
    const { data, error } = await bob.rpc('create_market_v3', {
      p_title: title,
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    if (error) throw error
    await page.goto(`/markets/${(data as { market_id: string }).market_id}`)
    await addToSlip(page, 'Yes')
  }

  const sheet = await openSlip(page)
  for (const title of titles) {
    await sheet.getByRole('group', { name: `Bet type for Yes, ${title}` }).getByRole('button', { name: 'Parlay' }).click()
  }
  const parlay = sheet.getByRole('region', { name: 'Parlay · 2 picks' })
  await expect(parlay.getByText(/Your stake is split evenly across these picks/)).toBeVisible()
  await parlay.getByLabel('Stake (DC)').fill('10')

  // Both markets open at 50%: each leg buys 5 DC of shares.
  const even = { q: [0, 0], liquidity: 50, index: 0 }
  const quote = lmsrParlayQuote([even, even], 10)
  const multiplier = `${formatOdds(quote.multiplierBp)}×`
  await expect(parlay.getByText(`Pays ${quote.payout} DC (${multiplier}) if every pick wins`)).toBeVisible()
  await expect(sheet.getByText(/~/)).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Place 1 bet · 10 DC' }).click()
  await expect(page.getByText(`Placed a 2-leg parlay paying ${quote.payout} DC (${multiplier}). Bets are final.`).first()).toBeVisible()
  await expect(sheet).toHaveCount(0)

  // The market on screen shows the leg with the fixed payout, and the parlay moved its price.
  const position = page.getByRole('region', { name: 'Your position' })
  await expect(position.getByText(`10 DC · 2 picks · pays ${quote.payout} DC if every pick wins.`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Outcomes' }).locator('.sr-only').getByText(/^5\d%$/)).toHaveCount(1)
})
