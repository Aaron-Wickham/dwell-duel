import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, type SlipSummary } from './helpers'
import { expectError } from './assertions'
import { pgQuery } from './pg-query'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, giveRole, type Member, type TestMarket } from './fixtures'
import { lmsrBuy, lmsrPrices } from '@/lib/markets/lmsr'
import { getMarket } from '@/lib/markets/get-market'
import { marketOdds } from '@/lib/markets/pricing'
import { getSlipView } from '@/lib/parlays/get-slip'

// 0102 (#333): new markets are priced by LMSR, solo bets on them pay a fixed number of shares,
// and those bets are final.
let alice: Member
let bob: Member
let carol: Member
let olive: Member
let aliceClient: TestClient
let bobClient: TestClient
let carolClient: TestClient
let oliveClient: TestClient
let market: TestMarket

const B = 50

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  olive = await makeMember('Olive')
  await giveRole(olive, 'owner')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  oliveClient = await clientFor(olive)
  for (const client of [aliceClient, bobClient, carolClient, oliveClient]) await ensureInvited(client)
  market = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
})

// Stored to six places, rounded down, as place_lmsr_bet stores it.
const stored = (shares: number) => Math.floor(shares * 1e6) / 1e6

async function balanceOf(member: Member): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  if (error) throw error
  return data.balance
}

async function outcomeShares(m: TestMarket): Promise<number[]> {
  const { data, error } = await serviceClient().from('market_outcomes').select('id, shares, q_offset').eq('market_id', m.marketId)
  if (error) throw error
  return m.outcomeIds.map((id) => {
    const row = data.find((o) => o.id === id)!
    return Number(row.shares) + Number(row.q_offset)
  })
}

// What the slip shows for a stake right now: the market's own q, through the TS mirror.
async function quote(m: TestMarket, outcome: number, stake: number): Promise<{ shares: number; payout: number }> {
  const shares = stored(lmsrBuy(await outcomeShares(m), B, outcome, stake))
  return { shares, payout: Math.floor(shares) }
}

async function bet(client: TestClient, m: TestMarket, outcome: number, amount: number, payout?: number) {
  const shown = payout ?? (await quote(m, outcome, amount)).payout
  return client.rpc('place_slip_v4', {
    p_singles: [{ outcome_id: m.outcomeIds[outcome], amount, payout: shown }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
}

async function close(m: TestMarket) {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', m.marketId)
  if (error) throw error
}

async function resolve(client: TestClient, m: TestMarket, outcome: number) {
  return client.rpc('resolve_market', {
    p_market_id: m.marketId,
    p_outcome_id: m.outcomeIds[outcome],
    p_note: 'Settled by the test',
  })
}

describe('create_market_v3', () => {
  it('makes an lmsr market with no seed that opens at even prices', async () => {
    const { data, error } = await serviceClient()
      .from('markets')
      .select('pricing, liquidity, seed_per_outcome, market_outcomes(shares, q_offset)')
      .eq('id', market.marketId)
      .single()
    if (error) throw error
    expect(data.pricing).toBe('lmsr')
    expect(Number(data.liquidity)).toBe(50)
    expect(data.seed_per_outcome).toBe(0)
    expect(data.market_outcomes.map((o) => [Number(o.shares), Number(o.q_offset)])).toEqual([
      [0, 0],
      [0, 0],
    ])
    const [row] = await pgQuery<{ yes: string; no: string }>(
      `select public.lmsr_price(array[0,0]::numeric[], 50, 1) as yes, public.lmsr_price(array[0,0]::numeric[], 50, 2) as no`,
    )
    expect(Number(row.yes)).toBeCloseTo(0.5, 12)
    expect(Number(row.no)).toBeCloseTo(0.5, 12)
  })

  it('opens a four-way market at 25% each', async () => {
    const four = await createTestMarket(aliceClient, ['A', 'B', 'C', 'D'], { lmsr: true })
    expect(lmsrPrices(await outcomeShares(four), B)).toEqual([0.25, 0.25, 0.25, 0.25])
  })

  it('returns the first market on a retry with the same key', async () => {
    const key = crypto.randomUUID()
    const args = {
      p_title: 'Retry',
      p_description: null,
      p_kind: 'over_under',
      p_outcome_labels: [],
      p_close_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_line: 3.5,
      p_idempotency_key: key,
    }
    const first = await aliceClient.rpc('create_market_v3', args)
    const second = await aliceClient.rpc('create_market_v3', args)
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const a = first.data as { market_id: string; replayed: boolean }
    const b = second.data as { market_id: string; replayed: boolean }
    expect(b).toEqual({ market_id: a.market_id, replayed: true })
    const { data } = await serviceClient().from('markets').select('pricing, line').eq('id', a.market_id).single()
    expect(data).toEqual({ pricing: 'lmsr', line: 3.5 })
  })

})

describe('place_slip_v4 on an lmsr market', () => {
  it('buys the shares lmsr_buy gives, at the cost of the stake', async () => {
    // The spec's worked example: 10 DC on a fresh b = 50 market buys about 18.33 shares.
    const expected = await quote(market, 0, 10)
    expect(expected.shares).toBeCloseTo(18.329474, 6)
    expect(expected.payout).toBe(18)

    const { data, error } = await bet(bobClient, market, 0, 10, 18)
    expect(error).toBeNull()
    expect(data as SlipSummary).toEqual({ parlay_id: null, solos: 1, picks: [market.outcomeIds[0]], replayed: false })

    const { data: rows } = await serviceClient().from('bets').select('amount, cost, shares').eq('profile_id', bob.id)
    expect(rows).toHaveLength(1)
    expect(rows![0].amount).toBe(10)
    expect(rows![0].cost).toBe(10)
    expect(Number(rows![0].shares)).toBe(expected.shares)
    expect(await balanceOf(bob)).toBe(90)

    const { data: outcome } = await serviceClient()
      .from('market_outcomes')
      .select('shares, pool_total, pool_version')
      .eq('id', market.outcomeIds[0])
      .single()
    expect(Number(outcome!.shares)).toBe(expected.shares)
    expect(outcome!.pool_total).toBe(10)
    expect(outcome!.pool_version).toBeGreaterThan(0)
    // The price moved to about 59%, as the worked example says.
    expect(lmsrPrices(await outcomeShares(market), B)[0]).toBeCloseTo(0.5906, 4)
  })

  it('prices a later bet from the shares already sold, plus each outcome’s q_offset', async () => {
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()
    await serviceClient().from('market_outcomes').update({ q_offset: 7 }).eq('id', market.outcomeIds[1])
    const expected = await quote(market, 1, 25)
    expect(expected.shares).toBe(stored(lmsrBuy([stored(lmsrBuy([0, 0], B, 0, 10)), 7], B, 1, 25)))
    expect((await bet(carolClient, market, 1, 25, expected.payout)).error).toBeNull()
    const { data } = await serviceClient().from('bets').select('shares').eq('profile_id', carol.id).single()
    expect(Number(data!.shares)).toBe(expected.shares)
  })

  it('refuses with price_moved and the new payout when it is more than 2% under what was shown, and places nothing', async () => {
    const { error } = await bet(bobClient, market, 0, 10, 19)
    expectError(error, `pick ${market.outcomeIds[0]}: price_moved:18`)
    expect(error!.code).toBe('P0001')
    expect(await balanceOf(bob)).toBe(100)
    const { count } = await serviceClient().from('bets').select('id', { count: 'exact', head: true }).eq('profile_id', bob.id)
    expect(count).toBe(0)

    // Confirming again at the new figure places it.
    expect((await bet(bobClient, market, 0, 10, 18)).error).toBeNull()
  })

  it('accepts a payout up to 2% under the one shown', async () => {
    // 40 DC on a fresh market pays 61: shown 62 is within 2%, shown 63 isn't.
    expect((await quote(market, 0, 40)).payout).toBe(61)
    expectError((await bet(bobClient, market, 0, 40, 63)).error, 'price_moved:61')
    expect((await bet(bobClient, market, 0, 40, 62)).error).toBeNull()
  })

  it('treats a single with no shown payout as a moved price', async () => {
    const { error } = await bobClient.rpc('place_slip_v4', {
      p_singles: [{ outcome_id: market.outcomeIds[0], amount: 10 }],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
    })
    expectError(error, 'price_moved:18')
  })

  it('replays the first result on a retry with the same attempt key', async () => {
    const key = crypto.randomUUID()
    const args = {
      p_singles: [{ outcome_id: market.outcomeIds[0], amount: 10, payout: 18 }],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
      p_idempotency_key: key,
    }
    expect((await bobClient.rpc('place_slip_v4', args)).error).toBeNull()
    const again = await bobClient.rpc('place_slip_v4', args)
    expect(again.error).toBeNull()
    expect((again.data as SlipSummary).replayed).toBe(true)
    expect(await balanceOf(bob)).toBe(90)
  })

  it('lets a key refused for a moved price be used again', async () => {
    const key = crypto.randomUUID()
    const args = (payout: number) => ({
      p_singles: [{ outcome_id: market.outcomeIds[0], amount: 10, payout }],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
      p_idempotency_key: key,
    })
    expectError((await bobClient.rpc('place_slip_v4', args(25))).error, 'price_moved:18')
    const { data, error } = await bobClient.rpc('place_slip_v4', args(18))
    expect(error).toBeNull()
    expect((data as SlipSummary).replayed).toBe(false)
  })

  it('keeps the existing stake and balance checks, and caps a stake', async () => {
    expectError((await bet(bobClient, market, 0, 0, 0)).error, 'bet amount must be positive')
    const { error } = await bet(bobClient, market, 0, 101)
    expectError(error, { code: '23514', message: 'profiles_balance_check' })
    expectError((await bet(bobClient, market, 0, 1_000_001, 1)).error, 'a bet can stake at most 1,000,000 DC')
  })

  it('refuses after the market closes', async () => {
    await close(market)
    expectError((await bet(bobClient, market, 0, 10, 18)).error, 'market is not open for betting')
  })
})

describe('the app’s reads of an lmsr market', () => {
  it('give the market page its pricing and shares, and the slip what it needs to quote exactly', async () => {
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()
    const detail = await getMarket(carolClient, market.marketId)
    expect(detail).toMatchObject({ pricing: 'lmsr', liquidity: 50, seedPerOutcome: 0 })
    const prices = lmsrPrices(await outcomeShares(market), B)
    const chance = new Map(marketOdds(detail!).map((o) => [o.outcomeId, o.impliedProbability]))
    expect(market.outcomeIds.map((id) => chance.get(id))).toEqual(prices)

    const view = await getSlipView(carolClient, [{ outcomeId: market.outcomeIds[1], parlay: false }])
    const [pick] = view.picks
    expect(pick.open).toBe(true)
    expect(pick.lmsr!.liquidity).toBe(50)
    expect(pick.lmsr!.q[pick.lmsr!.index]).toBe(0)
    expect([...pick.lmsr!.q].sort()).toEqual([...(await outcomeShares(market))].sort())
  })
})

describe('the build before 0102', () => {
  it('can’t bet on an lmsr market through place_bet', async () => {
    const direct = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 10 })
    expectError(direct.error, 'DwellDuel just updated. Refresh to bet.')
    expect(await balanceOf(bob)).toBe(100)
  })

  it('can’t call place_lmsr_bet directly', async () => {
    const { error } = await bobClient.rpc('place_lmsr_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_amount: 10,
      p_payout: 18,
    })
    expectError(error, { code: '42501', message: 'permission denied' })
  })
})

describe('resolving an lmsr market', () => {
  it('pays each winning bet floor(shares) DC and keeps the fractions as the remainder', async () => {
    const bobQuote = await quote(market, 0, 10)
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()
    const carolQuote = await quote(market, 1, 10)
    expect((await bet(carolClient, market, 1, 10)).error).toBeNull()
    await close(market)

    expect((await resolve(aliceClient, market, 0)).error).toBeNull()
    expect(await balanceOf(bob)).toBe(90 + bobQuote.payout)
    expect(await balanceOf(carol)).toBe(90)

    const { data: m } = await serviceClient().from('markets').select('current_resolution_id').eq('id', market.marketId).single()
    const { data: r } = await serviceClient()
      .from('market_resolutions')
      .select('payout_remainder')
      .eq('id', m!.current_resolution_id!)
      .single()
    expect(Number(r!.payout_remainder)).toBeCloseTo(bobQuote.shares - bobQuote.payout, 6)

    // An override takes Bob's payout back and pays Carol hers.
    expect((await resolve(oliveClient, market, 1)).error).toBeNull()
    expect(await balanceOf(bob)).toBe(90)
    expect(await balanceOf(carol)).toBe(90 + carolQuote.payout)
  })

  it('refuses an override that would claw back more than a winner still has', async () => {
    expect((await bet(bobClient, market, 0, 5)).error).toBeNull()
    expect((await bet(carolClient, market, 1, 10)).error).toBeNull()
    await close(market)
    expect((await resolve(aliceClient, market, 0)).error).toBeNull()
    expect(await balanceOf(bob)).toBe(104)
    // Bob spends his 9 DC win on another market, so the override can't take it back.
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    expect((await bet(bobClient, other, 0, 100)).error).toBeNull()
    const { error } = await resolve(oliveClient, market, 1)
    expectError(error, 'clawback_short:[{"owed": 9, "balance": 4, "display_name": "Bob"}]')
    expect(await balanceOf(bob)).toBe(4)
    expect(await balanceOf(carol)).toBe(90)
  })

  it('refunds nobody when nobody backed the winner', async () => {
    const three = await createTestMarket(aliceClient, ['A', 'B', 'C'], { lmsr: true })
    expect((await bet(bobClient, three, 0, 10)).error).toBeNull()
    await close(three)
    expect((await resolve(aliceClient, three, 2)).error).toBeNull()
    expect(await balanceOf(bob)).toBe(90)

    // Profile stats count it lost, not refunded.
    const { data: stats } = await bobClient.rpc('member_stats', { p_profile_id: bob.id }).single()
    expect(stats).toMatchObject({ bets_won: 0, bets_lost: 1, bets_refunded: 0 })
    const { data: records } = await bobClient.rpc('member_records', { p_ids: [bob.id] })
    expect(records).toEqual([{ profile_id: bob.id, won: 0, lost: 1 }])
  })
})

describe('voiding an lmsr market', () => {
  it('refunds every bet its cost', async () => {
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()
    expect((await bet(carolClient, market, 1, 30)).error).toBeNull()
    expect((await aliceClient.rpc('void_market', { p_market_id: market.marketId, p_reason: 'Called off' })).error).toBeNull()
    expect(await balanceOf(bob)).toBe(100)
    expect(await balanceOf(carol)).toBe(100)
  })
})

describe('the economy summary', () => {
  type Row = Record<string, number | string>
  async function summary(): Promise<Record<string, number>> {
    const { data, error } = await oliveClient.rpc('economy_summary', { p_month_start: new Date().toISOString() }).single()
    if (error) throw error
    return Object.fromEntries(Object.entries(data as Row).map(([k, v]) => [k, Number(v)]))
  }

  it('books an lmsr market’s result on the market maker line, and its rounded-away fractions on payout rounding', async () => {
    // 5 DC on a fresh market buys about 9.545 shares: it pays 9, and 0.545 rounds to 1 DC.
    const bobQuote = await quote(market, 0, 5)
    expect(bobQuote.payout).toBe(9)
    expect(bobQuote.shares - 9).toBeGreaterThan(0.5)
    expect((await bet(bobClient, market, 0, 5)).error).toBeNull()
    expect((await bet(carolClient, market, 1, 10)).error).toBeNull()
    await close(market)
    expect((await resolve(aliceClient, market, 0)).error).toBeNull()

    const s = await summary()
    // Members put in 15 DC and got 9 back. Of the 6 DC that left, the market maker kept 5 and
    // rounding 1.
    expect(s.market_maker_added).toBe(0)
    expect(s.market_maker_removed).toBe(5)
    expect(s.payout_rounding_added).toBe(0)
    expect(s.payout_rounding_removed).toBe(1)
    expect(s.seed_payouts_added + s.seed_payouts_removed).toBe(0)
    // Everything ever added less removed is what's in circulation.
    expect(s.all_time_added - s.all_time_removed).toBe(s.balances + s.bets_at_stake + s.parlays_at_stake)
  })

  it('moves the rounded-away fractions with an override, and keeps the market maker line whole', async () => {
    expect((await bet(bobClient, market, 0, 5)).error).toBeNull()
    const carolQuote = await quote(market, 1, 10)
    expect((await bet(carolClient, market, 1, 10)).error).toBeNull()
    await close(market)
    expect((await resolve(aliceClient, market, 0)).error).toBeNull()
    expect((await resolve(oliveClient, market, 1)).error).toBeNull()

    const s = await summary()
    const carolRemainder = Math.round(carolQuote.shares - carolQuote.payout)
    // Bob's win and its 1 DC of rounding are taken back; Carol's payout and its rounding stand.
    expect(s.payout_rounding_added - s.payout_rounding_removed).toBe(-carolRemainder)
    expect(s.market_maker_added - s.market_maker_removed).toBe(carolQuote.payout - 15 + carolRemainder)
    expect(s.all_time_added - s.all_time_removed).toBe(s.balances + s.bets_at_stake + s.parlays_at_stake)
  })

  it('books a market maker loss as DC added', async () => {
    // Bob alone on the winner: he paid 10 and is paid 18, so the market maker added 8.
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()
    await close(market)
    expect((await resolve(aliceClient, market, 0)).error).toBeNull()
    const s = await summary()
    expect(s.market_maker_added).toBe(8)
    expect(s.market_maker_removed).toBe(0)
    expect(s.all_time_added - s.all_time_removed).toBe(s.balances + s.bets_at_stake + s.parlays_at_stake)
  })
})

describe('charts and sparklines on an lmsr market', () => {
  it('chart each bet at the LMSR price of the shares sold so far', async () => {
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()
    expect((await bet(carolClient, market, 1, 30)).error).toBeNull()
    const { data, error } = await bobClient.rpc('market_sparklines', { p_market_ids: [market.marketId] })
    if (error) throw error
    const points = (data as unknown as { points: { shares: Record<string, number> }[] }[])[0].points
    expect(points).toHaveLength(2)

    const { data: bets } = await serviceClient()
      .from('bets')
      .select('outcome_id, shares')
      .eq('market_id', market.marketId)
      .order('id')
    const q = [0, 0]
    bets!.forEach((b, i) => {
      q[market.outcomeIds.indexOf(b.outcome_id)] += Number(b.shares)
      const prices = lmsrPrices(q, B)
      expect(points[i].shares[market.outcomeIds[0]]).toBeCloseTo(prices[0], 10)
      expect(points[i].shares[market.outcomeIds[1]]).toBeCloseTo(prices[1], 10)
    })
  })
})

describe('the weekly recap on an lmsr market', () => {
  it('measures an upset by the LMSR price the winner closed at', async () => {
    expect((await bet(bobClient, market, 0, 30)).error).toBeNull()
    const q = await outcomeShares(market)
    await close(market)
    expect((await resolve(aliceClient, market, 1)).error).toBeNull()
    await pgQuery(
      `update public.activity_events set occurred_at = '2030-10-30T12:00:00Z' where market_id = '${market.marketId}' and resolution_id is not null`,
    )
    const { data, error } = await carolClient.rpc('weekly_recap', { p_week: '2030-10-28' }).single()
    if (error) throw error
    expect(data).toMatchObject({ upset_market_id: market.marketId, upset_outcome_label: 'No' })
    expect((data as { upset_chance: number }).upset_chance).toBeCloseTo(lmsrPrices(q, B)[1], 10)
  })
})

describe('pool markets', () => {
  // No pool market has been open since 0105; place_slip_v4 keeps the branch, as the fixtures that
  // build pool history use it.
  it('still take pool bets through place_slip_v4, ignoring the payout', async () => {
    const pool = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await bobClient.rpc('place_slip_v4', {
      p_singles: [{ outcome_id: pool.outcomeIds[0], amount: 10, payout: 999 }],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
    })
    expect(error).toBeNull()
    const { data } = await serviceClient().from('bets').select('shares, cost').eq('profile_id', bob.id).single()
    expect(data).toMatchObject({ shares: null, cost: null })
    expect(await balanceOf(bob)).toBe(90)
  })
})
