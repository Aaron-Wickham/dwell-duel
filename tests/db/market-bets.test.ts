import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getMarketBets } from '@/lib/markets/get-market'

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

describe('getMarketBets', () => {
  it("lists every member's bets on the market, newest first, with names", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    for (const [client, outcomeIndex, amount] of [
      [aliceClient, 0, 10],
      [bobClient, 1, 20],
    ] as const) {
      const { error } = await client.rpc('place_bet', {
        p_market_id: market.marketId,
        p_outcome_id: market.outcomeIds[outcomeIndex],
        p_amount: amount,
      })
      if (error) throw error
    }
    const { error: otherErr } = await bobClient.rpc('place_bet', {
      p_market_id: other.marketId,
      p_outcome_id: other.outcomeIds[0],
      p_amount: 5,
    })
    if (otherErr) throw otherErr

    const bets = await getMarketBets(bobClient, market.marketId)
    expect(bets.map((b) => [b.bettorName, b.profileId, b.outcomeId, b.amount])).toEqual([
      ['Bob', bob.id, market.outcomeIds[1], 20],
      ['Alice', alice.id, market.outcomeIds[0], 10],
    ])
  })

  it('is empty for an uninvited session', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await aliceClient.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_amount: 10,
    })
    if (error) throw error

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getMarketBets(carolClient, market.marketId)).toEqual([])
  })
})
