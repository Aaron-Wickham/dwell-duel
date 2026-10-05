import { describe, it, expect, beforeEach, vi } from 'vitest'
import { serviceClient, type TestClient, reconcilePoolTotals } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { getChartSeries, readChancesAt, CHART_BUCKETS } from '@/lib/markets/chart-series'
import { buildProbabilitySeries, withSeededStart, type SeriesPoint } from '@/lib/markets/probability-series'
import { listSparklines } from '@/lib/markets/sparklines'
import { lmsrBuy, lmsrPrices } from '@/lib/markets/lmsr'
import { weeklyChange } from '@/lib/markets/chart-summary'
import { getMarket } from '@/lib/markets/get-market'
import { marketOdds } from '@/lib/markets/pricing'

// No Next data cache outside a request: every read reaches the database.
vi.mock('next/cache', () => ({ unstable_cache: <F>(fn: F) => fn }))

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const B = 50

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function placeBet(client: TestClient, marketId: string, outcomeId: string, amount: number) {
  const { error } = await client.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeId, p_amount: amount })
  if (error) throw error
}

async function marketFacts(marketId: string, outcomeIds: string[]) {
  const { data, error } = await serviceClient().from('markets').select('seed_per_outcome, created_at, pricing').eq('id', marketId).single()
  if (error) throw error
  return {
    id: marketId,
    version: 'test',
    seedPerOutcome: data.seed_per_outcome as number,
    createdAt: data.created_at as string,
    pricing: data.pricing as 'pool' | 'lmsr',
    outcomeIds,
  }
}

async function betsOf(marketId: string) {
  const { data, error } = await serviceClient()
    .from('bets')
    .select('id, outcome_id, amount, shares, created_at')
    .eq('market_id', marketId)
    .order('created_at')
    .order('id')
  if (error) throw error
  return data
}

// Moves each bet to its own instant, in id order; a bet's price doesn't depend on when it's stamped.
async function stampBets(marketId: string, times: number[]) {
  const bets = await betsOf(marketId)
  for (const [i, bet] of bets.entries()) {
    const { error } = await serviceClient().from('bets').update({ created_at: new Date(times[i]).toISOString() }).eq('id', bet.id)
    if (error) throw error
  }
}

async function backdateMarket(marketId: string, at: number) {
  const { error } = await serviceClient().from('markets').update({ created_at: new Date(at).toISOString() }).eq('id', marketId)
  if (error) throw error
}

function expectSameSeries(actual: SeriesPoint[], expected: SeriesPoint[], outcomeIds: string[]) {
  expect(actual.map((p) => p.t)).toEqual(expected.map((p) => p.t))
  actual.forEach((p, i) => {
    for (const id of outcomeIds) expect(p.shares[id]).toBeCloseTo(expected[i].shares[id], 10)
  })
}

describe('getChartSeries (#68, #409)', () => {
  it('matches the series built from every bet, seeded start included, and counts the bets', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 25)
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 5)
    const now = Date.now()
    await backdateMarket(market.marketId, now - 4 * HOUR)
    await stampBets(market.marketId, [now - 3 * HOUR, now - 2 * HOUR, now - HOUR])
    const facts = await marketFacts(market.marketId, market.outcomeIds)

    const bets = await betsOf(market.marketId)
    const expected = buildProbabilitySeries(
      market.outcomeIds,
      bets.map((b) => ({ outcomeId: b.outcome_id, amount: b.amount, createdAt: b.created_at })),
      { seed: 20, startAt: facts.createdAt },
    )

    const chart = await getChartSeries(bobClient, facts, now)
    expect(chart.betCount).toBe(3)
    expectSameSeries(chart.series.All, expected, market.outcomeIds)
  })

  it('buckets each range by time, so a busy market’s day keeps its intraday moves', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const now = Date.now()
    // 400 bets over the month before yesterday, then 100 in the last day, about 14 minutes apart.
    // Rows straight into bets: this is about the chart's bucketing, not about placing bets.
    const times = [
      ...Array.from({ length: 400 }, (_, i) => now - 30 * DAY + i * ((28 * DAY) / 400)),
      ...Array.from({ length: 100 }, (_, i) => now - DAY + (i + 1) * ((DAY - 60_000) / 100)),
    ]
    const rows = times.map((t, i) => ({
      market_id: market.marketId,
      outcome_id: market.outcomeIds[i % 3 === 0 ? 1 : 0],
      profile_id: alice.id,
      amount: 1 + (i % 7),
      created_at: new Date(t).toISOString(),
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error
    await reconcilePoolTotals()

    const facts = await marketFacts(market.marketId, market.outcomeIds)
    const chart = await getChartSeries(bobClient, facts, now)
    expect(chart.betCount).toBe(500)

    const bets = await betsOf(market.marketId)
    const every = buildProbabilitySeries(
      market.outcomeIds,
      bets.map((b) => ({ outcomeId: b.outcome_id, amount: b.amount, createdAt: b.created_at })),
    )
    const at = (t: number) => every.filter((p) => p.t <= t).at(-1)!

    // The day: the price it opened on (the last move before it), then every one of its 100 bets.
    const day = chart.series['1D']
    expect(day).toHaveLength(101)
    expect(day[0].t).toBeLessThanOrEqual(now - DAY)
    expectSameSeries(day.slice(1), every.slice(-100), market.outcomeIds)
    expectSameSeries(day.slice(0, 1), [at(now - DAY)], market.outcomeIds)

    // The week and the whole history are cut into at most CHART_BUCKETS slices, each its last move.
    for (const range of ['1W', 'All'] as const) {
      const points = chart.series[range]
      expect(points.length).toBeLessThanOrEqual(CHART_BUCKETS + 1)
      expectSameSeries(points, points.map((p) => at(p.t)), market.outcomeIds)
      expect(points.at(-1)!.t).toBe(every.at(-1)!.t)
    }
    expect(chart.series.All[0].t).toBe(every[0].t)
  })

  it('prices an lmsr market as its cards do', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No', 'Maybe'], { lmsr: true })
    await placeLmsrBet(bobClient, market, 0, 40)
    await placeLmsrBet(aliceClient, market, 2, 15)
    await placeLmsrBet(bobClient, market, 1, 25)
    const now = Date.now()
    await backdateMarket(market.marketId, now - 4 * HOUR)
    await stampBets(market.marketId, [now - 3 * HOUR, now - 2 * HOUR, now - HOUR])
    const facts = await marketFacts(market.marketId, market.outcomeIds)

    const chart = await getChartSeries(bobClient, facts, now)
    const { data, error } = await bobClient.rpc('market_sparklines', { p_market_ids: [market.marketId], p_points: 200 })
    if (error) throw error
    const sampled = (data[0].points as { t: string; shares: Record<string, number> }[]).map((p) => ({ t: Date.parse(p.t), shares: p.shares }))
    expectSameSeries(chart.series.All, withSeededStart(sampled, facts), market.outcomeIds)
  })

  it('has no points and no bets for an unseeded market nobody has bet on', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const chart = await getChartSeries(bobClient, await marketFacts(market.marketId, market.outcomeIds), Date.now())
    expect(chart).toEqual({ series: { '1D': [], '1W': [], All: [] }, betCount: 0 })
  })
})

async function placeLmsrBet(client: TestClient, market: TestMarket, outcome: number, amount: number) {
  const { data, error } = await serviceClient().from('market_outcomes').select('id, shares, q_offset').eq('market_id', market.marketId)
  if (error) throw error
  const q = market.outcomeIds.map((id) => {
    const row = data.find((o) => o.id === id)!
    return Number(row.shares) + Number(row.q_offset)
  })
  const payout = Math.floor(Math.floor(lmsrBuy(q, B, outcome, amount) * 1e6) / 1e6)
  const placed = await client.rpc('place_slip_v4', {
    p_singles: [{ outcome_id: market.outcomeIds[outcome], amount, payout }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
  if (placed.error) throw placed.error
}

describe('the cards’ weekly change (#409)', () => {
  it('is the chance now minus the chance at now − 7 days, read at that instant', async () => {
    const now = Date.now()
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await backdateMarket(market.marketId, now - 20 * DAY)
    await placeLmsrBet(bobClient, market, 1, 30)
    await placeLmsrBet(aliceClient, market, 0, 10)
    await placeLmsrBet(bobClient, market, 0, 60)
    await placeLmsrBet(aliceClient, market, 1, 5)
    // Two moves before the week, one just inside it, one today.
    await stampBets(market.marketId, [now - 12 * DAY, now - 8 * DAY, now - 7 * DAY + HOUR, now - HOUR])

    const bets = await betsOf(market.marketId)
    const weekAgo = now - 7 * DAY
    const q = [0, 0]
    for (const bet of bets.filter((b) => Date.parse(b.created_at) <= weekAgo)) q[market.outcomeIds.indexOf(bet.outcome_id)] += Number(bet.shares)
    const thenYes = lmsrPrices(q, B)[0]

    const chances = await readChancesAt(bobClient, [market.marketId], weekAgo)
    const point = chances.get(market.marketId)!
    expect(point.t).toBe(Date.parse(bets[1].created_at))
    expect(point.shares[market.outcomeIds[0]]).toBeCloseTo(thenYes, 10)

    const listed = (await getMarket(bobClient, market.marketId))!
    const nowYes = marketOdds(listed).find((o) => o.outcomeId === market.outcomeIds[0])!.impliedProbability!
    const nowPct = Math.round(nowYes * 100)
    const facts = await marketFacts(market.marketId, market.outcomeIds)
    const change = weeklyChange(withSeededStart([point], facts), market.outcomeIds[0], nowPct, now)
    expect(change).toBe(nowPct - Math.round(thenYes * 100))
    expect(change).not.toBe(0)
  })

  it('starts from the even split for a market a week old with no move before then, and is unknown for a newer one', async () => {
    const now = Date.now()
    const old = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await backdateMarket(old.marketId, now - 10 * DAY)
    const fresh = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await backdateMarket(fresh.marketId, now - 3 * DAY)
    await placeLmsrBet(bobClient, old, 0, 20)
    await placeLmsrBet(bobClient, fresh, 0, 20)

    const chances = await readChancesAt(bobClient, [old.marketId, fresh.marketId], now - 7 * DAY)
    expect(chances.size).toBe(0)

    const oldFacts = await marketFacts(old.marketId, old.outcomeIds)
    expect(weeklyChange(withSeededStart([], oldFacts), old.outcomeIds[0], 61, now)).toBe(61 - 50)
    const freshFacts = await marketFacts(fresh.marketId, fresh.outcomeIds)
    expect(weeklyChange(withSeededStart([], freshFacts), fresh.outcomeIds[0], 61, now)).toBeNull()
  })
})

describe('card sparklines and the market page chart (#110)', () => {
  it('both start a seeded market at the even split when it opened, and agree point for point', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 25)
    const now = Date.now()
    await backdateMarket(market.marketId, now - 3 * HOUR)
    await stampBets(market.marketId, [now - 2 * HOUR, now - HOUR])
    const facts = await marketFacts(market.marketId, market.outcomeIds)

    const chart = await getChartSeries(bobClient, facts, now)
    const card = (await listSparklines(bobClient, [[facts]])).get(market.marketId)!

    expect(card[0]).toEqual({
      t: Date.parse(facts.createdAt),
      shares: { [market.outcomeIds[0]]: 0.5, [market.outcomeIds[1]]: 0.5 },
    })
    expect(card).toHaveLength(3)
    // The card's compact series (0095) keeps whole seconds and four decimals; the seeded start
    // comes from the market's own created_at on both.
    expect(card).toEqual(
      chart.series.All.map((p, i) => ({
        t: i === 0 ? p.t : Math.floor(p.t / 1000) * 1000,
        shares: Object.fromEntries(Object.entries(p.shares).map(([id, share]) => [id, Math.round(share * 10_000) / 10_000])),
      })),
    )
  })

  it('gives a seeded market nobody has bet on just its even start on its card', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const facts = await marketFacts(market.marketId, market.outcomeIds)
    const card = (await listSparklines(bobClient, [[facts]])).get(market.marketId)
    expect(card).toEqual([{ t: Date.parse(facts.createdAt), shares: { [market.outcomeIds[0]]: 0.5, [market.outcomeIds[1]]: 0.5 } }])
  })

  it('starts an unseeded market’s card at its first bet', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    const facts = await marketFacts(market.marketId, market.outcomeIds)
    const card = (await listSparklines(bobClient, [[facts]])).get(market.marketId)!
    expect(card).toHaveLength(1)
    expect(card[0].shares[market.outcomeIds[0]]).toBeCloseTo(1, 10)
  })
})
