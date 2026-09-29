import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getChartSeries, CHART_POINTS } from '@/lib/markets/chart-series'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
import type { DbClient } from '@/lib/supabase/database'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function placeBet(client: SupabaseClient, marketId: string, outcomeId: string, amount: number) {
  const { error } = await client.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeId, p_amount: amount })
  if (error) throw error
}

async function marketFacts(marketId: string, outcomeIds: string[]) {
  const { data, error } = await serviceClient().from('markets').select('seed_per_outcome, created_at').eq('id', marketId).single()
  if (error) throw error
  return { id: marketId, seedPerOutcome: data.seed_per_outcome as number, createdAt: data.created_at as string, outcomeIds }
}

describe('getChartSeries (#68)', () => {
  it('matches the series built from every bet, seeded start included, and counts the bets', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 25)
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 5)
    const facts = await marketFacts(market.marketId, market.outcomeIds)

    const { data: bets, error } = await serviceClient()
      .from('bets')
      .select('outcome_id, amount, created_at')
      .eq('market_id', market.marketId)
      .order('created_at')
      .order('id')
    if (error) throw error
    const expected = buildProbabilitySeries(
      market.outcomeIds,
      bets.map((b) => ({ outcomeId: b.outcome_id, amount: b.amount, createdAt: b.created_at })),
      { seed: 20, startAt: facts.createdAt },
    )

    const chart = await getChartSeries(bobClient as unknown as DbClient, facts)
    expect(chart.betCount).toBe(3)
    expect(chart.points.map((p) => p.t)).toEqual(expected.map((p) => p.t))
    chart.points.forEach((p, i) => {
      for (const id of market.outcomeIds) expect(p.shares[id]).toBeCloseTo(expected[i].shares[id], 10)
    })
  })

  it('caps a busy market at CHART_POINTS points, ending on its latest odds', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    // Rows straight into bets: this is about the chart's sampling, not about placing bets.
    const start = Date.parse('2026-09-01T00:00:00Z')
    const rows = Array.from({ length: CHART_POINTS + 50 }, (_, i) => ({
      market_id: market.marketId,
      outcome_id: market.outcomeIds[i % 3 === 0 ? 1 : 0],
      profile_id: alice.id,
      amount: 1,
      created_at: new Date(start + i * 1000).toISOString(),
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const chart = await getChartSeries(bobClient as unknown as DbClient, await marketFacts(market.marketId, market.outcomeIds))
    expect(chart.betCount).toBe(CHART_POINTS + 50)
    expect(chart.points).toHaveLength(CHART_POINTS)
    const noBets = rows.filter((r) => r.outcome_id === market.outcomeIds[1]).length
    expect(chart.points.at(-1)!.shares[market.outcomeIds[1]]).toBeCloseTo(noBets / rows.length, 10)
    expect(chart.points.at(-1)!.t).toBe(Date.parse(rows.at(-1)!.created_at))
  })

  it('has no points and no bets for an unseeded market nobody has bet on', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const chart = await getChartSeries(bobClient as unknown as DbClient, await marketFacts(market.marketId, market.outcomeIds))
    expect(chart).toEqual({ points: [], betCount: 0 })
  })
})
