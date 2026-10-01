import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, giveRole } from './fixtures'
import { getAtStake } from '@/lib/home/at-stake'

let alice: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  let bob: Member
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const c of [aliceClient, bobClient]) await ensureInvited(c)
  await giveRole(alice, 'admin')
})

describe('my_at_stake', () => {
  it('counts open solo bets and pending parlays, and only my own', async () => {
    expect(await getAtStake(bobClient)).toEqual({ wagers: 0, dc: 0 })

    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    for (const [market, amount] of [
      [a, 5],
      [b, 7],
    ] as const) {
      const { error } = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: amount })
      if (error) throw error
    }
    const { error: parlayErr } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]], p_stake: 3 })
    if (parlayErr) throw parlayErr
    await aliceClient.rpc('place_bet', { p_market_id: a.marketId, p_outcome_id: a.outcomeIds[0], p_amount: 9 })

    expect(await getAtStake(bobClient)).toEqual({ wagers: 3, dc: 15 })

    // Resolving B settles Bob's solo bet on it and loses his parlay (it picked No on B).
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: b.marketId, p_outcome_id: b.outcomeIds[0], p_note: 'Resolved in a test' })
    if (error) throw error
    expect(await getAtStake(bobClient)).toEqual({ wagers: 1, dc: 5 })
  })

  it('stops counting a cancelled bet', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 6 })
    const { data: bet } = await serviceClient().from('bets').select('id').eq('market_id', market.marketId).single()
    const { error } = await bobClient.rpc('cancel_bet', { p_bet_id: bet!.id })
    if (error) throw error
    expect(await getAtStake(bobClient)).toEqual({ wagers: 0, dc: 0 })
  })
})
