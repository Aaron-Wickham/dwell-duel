import { test, expect } from '@playwright/test'
import { addToSlip, openSlip } from './slip'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// 0102 (#333): a new market sells shares, so the slip shows exactly what a bet pays, and the bet
// is final once placed.
test('the slip shows an exact payout on a new market, and its bet is final', async ({ page }) => {
  const { data: alice, error: aliceErr } = await serviceClient().from('profiles').select('id, balance').eq('email', 'alice@example.com').single()
  if (aliceErr) throw aliceErr
  if (alice.balance < 10) {
    const { error } = await serviceClient().rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: 10 - alice.balance,
      p_type: 'test_top_up',
    })
    if (error) throw error
  }

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

  // A new market opens at even odds.
  const outcomes = page.getByRole('region', { name: 'Outcomes' })
  await expect(outcomes.getByText('50% (0 DC)')).toHaveCount(2)

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
  await expect(outcomes.getByText('59% (10 DC)')).toBeVisible()
})
