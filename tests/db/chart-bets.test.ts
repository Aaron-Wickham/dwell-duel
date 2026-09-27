import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getChartBets } from '@/lib/markets/chart-bets'

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

describe('getChartBets', () => {
  it("reads every member's bets on the market, oldest first, and nothing from other markets", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 20)
    await placeBet(bobClient, other.marketId, other.outcomeIds[0], 5)

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => [b.outcomeId, b.amount])).toEqual([
      [market.outcomeIds[0], 10],
      [market.outcomeIds[1], 20],
    ])
    expect(Date.parse(bets[0].createdAt)).toBeLessThanOrEqual(Date.parse(bets[1].createdAt))
  })

  it('orders bets placed at the same instant by id', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 20)
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 30)
    // Put the last bet first in time, then tie the other two, so only the id can order them.
    const db = serviceClient()
    const { data: rows, error } = await db.from('bets').select('id').eq('market_id', market.marketId).order('id')
    if (error) throw error
    const at = '2026-09-20T09:00:00+00:00'
    for (const [id, createdAt] of [
      [rows[0].id, at],
      [rows[1].id, at],
      [rows[2].id, '2026-09-19T09:00:00+00:00'],
    ] as const) {
      const { error: updateErr } = await db.from('bets').update({ created_at: createdAt }).eq('id', id)
      if (updateErr) throw updateErr
    }

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => b.amount)).toEqual([30, 10, 20])
  })

  it('reads past the 1000-row response cap', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly: 1001 place_bet calls would take minutes, and the reader never looks at pools.
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      market_id: market.marketId,
      outcome_id: market.outcomeIds[i % 2],
      profile_id: alice.id,
      amount: i + 1,
      created_at: new Date(start + i * 60_000).toISOString(),
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets).toHaveLength(1001)
    expect(bets.at(-1)?.amount).toBe(1001)
  })

  it('reads across a page boundary that falls inside a timestamp tie, in id order', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    // 520 bets at one instant: only the id orders them, and the 500-row page boundary falls inside the tie.
    const rows = Array.from({ length: 520 }, (_, i) => ({
      market_id: market.marketId,
      outcome_id: market.outcomeIds[i % 2],
      profile_id: alice.id,
      amount: i + 1,
      created_at: '2026-09-20T09:00:00.654321+00:00',
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => b.amount)).toEqual(Array.from({ length: 520 }, (_, i) => i + 1))
  })

  it('is empty for an uninvited session', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getChartBets(carolClient, market.marketId)).toEqual([])
  })
})
