import { test, expect, type Page } from '@playwright/test'
import { placeSolo } from './slip'
import { backers, clientForEmail, createPoolMarket } from '../tests/db/fixtures'
import { serviceClient, type TestClient } from '../tests/db/helpers'

// The review's screenshots, when run beside the remediation workspace; nowhere otherwise.
const SHOTS = process.env.B14_SHOTS ?? 'test-results/b14-shots'

// A navigation's view transition cross-fades for a moment; a screenshot waits it out.
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
}

type Market = { id: string; url: string; outcome: (label: string) => string }

async function topUp(email: string, to: number): Promise<void> {
  const { data, error } = await serviceClient().from('profiles').select('id, balance').eq('email', email).single()
  if (error) throw error
  if (data.balance >= to) return
  const { error: topUpErr } = await serviceClient().rpc('apply_coin_transaction', {
    p_profile_id: data.id,
    p_amount: to - data.balance,
    p_type: 'test_top_up',
  })
  if (topUpErr) throw topUpErr
}

// Bob makes the market, so Alice (the session on screen) can put it in a parlay, and the backers
// put 25 DC each on both outcomes: the 50 DC from 2 other members a parlay leg needs (0074).
async function backedMarket(bob: TestClient, title: string): Promise<Market> {
  const { data: id, error } = await createPoolMarket(bob, {
    p_title: title,
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  if (error) throw error
  const { data: outcomes, error: outcomesErr } = await serviceClient().from('market_outcomes').select('id, label').eq('market_id', id)
  if (outcomesErr) throw outcomesErr
  const outcome = (label: string) => outcomes!.find((o) => o.label === label)!.id
  for (const { client } of await backers()) {
    for (const label of ['Yes', 'No']) {
      const { error: betErr } = await client.rpc('place_bet', { p_market_id: id, p_outcome_id: outcome(label), p_amount: 25 })
      if (betErr) throw betErr
    }
  }
  return { id: id as string, url: `/markets/${id}`, outcome }
}

async function setup() {
  await topUp('alice@example.com', 100)
  for (const email of ['backer1@example.com', 'backer2@example.com']) {
    // backers() makes the pair on first use, so ask for them before topping them up.
    await backers()
    await topUp(email, 500)
  }
  return { alice: await clientForEmail('alice@example.com'), bob: await clientForEmail('bob@example.com') }
}

// A new market, priced by LMSR, which Bob makes so Alice (the session on screen) can bet on it.
async function lmsrMarket(bob: TestClient, title: string): Promise<Market> {
  const { data, error } = await bob.rpc('create_market_v3', {
    p_title: title,
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  if (error) throw error
  const id = (data as { market_id: string }).market_id
  const { data: outcomes, error: outcomesErr } = await serviceClient().from('market_outcomes').select('id, label').eq('market_id', id)
  if (outcomesErr) throw outcomesErr
  return { id, url: `/markets/${id}`, outcome: (label: string) => outcomes!.find((o) => o.label === label)!.id }
}

// A parlay through the slip's own action. place_lmsr_parlay refuses a payout more than 2% under
// the one shown, so showing 1 DC accepts whatever these legs pay now.
async function lmsrParlay(client: TestClient, outcomeIds: string[], stake: number): Promise<string> {
  const { data, error } = await client.rpc('place_slip_v4', {
    p_singles: [],
    p_parlay_outcome_ids: outcomeIds,
    p_parlay_stake: stake,
    p_parlay_payout: 1,
  })
  if (error) throw error
  return (data as { parlay_id: string }).parlay_id
}

test('Your position lists each bet with its fixed payout, and a parlay leg; parlay money rides on each outcome', async ({ page }) => {
  const { alice, bob } = await setup()
  const stamp = Date.now()
  const here = await lmsrMarket(bob, `Position open ${stamp}?`)
  const there = await lmsrMarket(bob, `Position elsewhere ${stamp}?`)

  const parlayId = await lmsrParlay(alice, [here.outcome('Yes'), there.outcome('Yes')], 5)

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(here.url)
  const position = page.getByRole('region', { name: 'Your position' })
  const outcomes = page.getByRole('region', { name: 'Outcomes' })

  const leg = position.getByRole('listitem').filter({ hasText: 'Parlay leg: Yes' })
  await expect(leg.getByText(/^5 DC · 2 picks · pays \d+ DC if every pick wins\./)).toBeVisible()
  await expect(leg.getByRole('link', { name: /^View parlay/ })).toHaveAttribute('href', `/parlays/${parlayId}`)

  // Parlay money shows beside each outcome; its share of the stake bought shares, so it moved the odds.
  const yes = outcomes.getByRole('listitem').filter({ hasText: /^Yes/ })
  await expect(yes.getByText('+5 DC riding in parlays')).toBeVisible()
  await expect(outcomes.getByText('so it moved these odds like a bet', { exact: false })).toBeVisible()
  await expect(outcomes.getByRole('listitem').filter({ hasText: /^No/ }).getByText(/riding in parlays/)).toHaveCount(0)

  // A solo bet joins the card with the payout fixed when it was placed, and no Cancel.
  await placeSolo(page, 'No', 5)
  const solo = position.getByRole('listitem').filter({ hasText: '5 DC on No' })
  await expect(solo.getByText(/^Pays \d+ DC$/)).toBeVisible()
  await expect(solo.getByRole('button')).toHaveCount(0)
  await expect(position.getByText('5 DC on this market · Bets are final.')).toBeVisible()

  // On a phone the card comes before the chart.
  const chart = page.getByRole('region', { name: 'Chance over time' })
  expect((await position.boundingBox())!.y).toBeLessThan((await chart.boundingBox())!.y)

  // Backer1's parlay rides on Yes too. The page follows parlay_legs for this market
  // (pageSubscriptions.marketDetail); this checks the figure itself after a refresh.
  const [backer1] = await backers()
  await lmsrParlay(backer1.client, [here.outcome('Yes'), there.outcome('No')], 10)
  await page.reload()
  await expect(yes.getByText('+15 DC riding in parlays')).toBeVisible()

  // From lg the card tops the right column, above Place a bet.
  await page.setViewportSize({ width: 1280, height: 900 })
  const [posBox, chartBox, betBox] = await Promise.all([
    position.boundingBox(),
    chart.boundingBox(),
    page.getByRole('region', { name: 'Place a bet' }).boundingBox(),
  ])
  expect(posBox!.x).toBeGreaterThan(chartBox!.x + chartBox!.width)
  expect(posBox!.y + posBox!.height).toBeLessThanOrEqual(betBox!.y)
  expect(Math.abs(posBox!.y - chartBox!.y)).toBeLessThanOrEqual(1)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/fix1-desktop-with-card.png`, fullPage: true })
})

test('once the market resolves, Your position shows each result, the net and the parlay leg’s state', async ({ page }) => {
  const { alice, bob } = await setup()
  const stamp = Date.now()
  const here = await backedMarket(bob, `Position settled ${stamp}?`)
  const there = await backedMarket(bob, `Position still open ${stamp}?`)

  const { error: betErr } = await alice.rpc('place_bet', { p_market_id: here.id, p_outcome_id: here.outcome('Yes'), p_amount: 10 })
  if (betErr) throw betErr
  const { error: parlayErr } = await alice.rpc('place_parlay', { p_outcome_ids: [here.outcome('Yes'), there.outcome('Yes')], p_stake: 5 })
  if (parlayErr) throw parlayErr
  const { error: resolveErr } = await alice.rpc('resolve_market', {
    p_market_id: here.id,
    p_outcome_id: here.outcome('Yes'),
    p_note: 'Settled in a test',
  })
  if (resolveErr) throw resolveErr

  await page.goto(here.url)
  const position = page.getByRole('region', { name: 'Your position' })
  // 10 × 110 / 60, rounded down: 18 back on a 10 DC stake.
  await expect(position.getByText('You won 8 DC on this market.')).toBeVisible()
  const solo = position.getByRole('listitem').filter({ hasText: '10 DC on Yes' })
  await expect(solo.getByText('Won 18 DC')).toBeVisible()
  await expect(solo.getByRole('button')).toHaveCount(0)
  await expect(position.getByText('Your leg won. The parlay waits on 1 more pick.')).toBeVisible()

  await expect(page.getByRole('region', { name: 'No more bets' }).getByText(/Solo bets have been paid; parlays pay once every pick has settled\./)).toBeVisible()
  // A pending parlay still rides on the winning outcome.
  await expect(page.getByRole('region', { name: 'Outcomes' }).getByText('+5 DC riding in parlays')).toBeVisible()
})

test('a member with nothing on the market sees no Your position card', async ({ page }) => {
  const { bob } = await setup()
  const market = await backedMarket(bob, `Position none ${Date.now()}?`)
  await page.goto(market.url)
  await expect(page.getByRole('region', { name: 'Outcomes' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your position' })).toHaveCount(0)

  // From lg the bet column starts level with the chart, with no empty row above it.
  await page.setViewportSize({ width: 1280, height: 900 })
  const [chartBox, betBox] = await Promise.all([
    page.getByRole('region', { name: 'Chance over time' }).boundingBox(),
    page.getByRole('region', { name: 'Place a bet' }).boundingBox(),
  ])
  expect(betBox!.x).toBeGreaterThan(chartBox!.x + chartBox!.width)
  expect(Math.abs(betBox!.y - chartBox!.y)).toBeLessThanOrEqual(1)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/fix1-desktop-no-card.png`, fullPage: true })
})
