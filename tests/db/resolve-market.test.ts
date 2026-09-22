import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('resolve_market (first resolution)', () => {
  it('pays winners in proportion to their stake', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).toBeNull()

    const db = serviceClient()
    // Total pool 50, Alice's 20 was the entire winning pool -> she gets all 50.
    const { data: aliceProfile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceProfile?.balance).toBe(100 - 20 + 50)

    const { data: bobProfile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobProfile?.balance).toBe(100 - 30)

    const { data: market } = await db.from('markets').select('status, current_resolution_id').eq('id', marketId).single()
    expect(market?.status).toBe('resolved')
    expect(market?.current_resolution_id).not.toBeNull()
  })

  it('refunds everyone when the winning outcome has no bets', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 40 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    // outcomeIds[0] ("Yes") wins, but nobody bet it.
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: bobProfile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobProfile?.balance).toBe(100) // fully refunded
  })

  it('rejects a non-creator, non-admin caller', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).not.toBeNull()
  })

  it('rejects resolving before close_at for a non-admin', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 60_000 })

    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).not.toBeNull()
  })

  it('lets an admin resolve before close_at', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 60_000 })

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const bobClient = await clientFor(bob)

    const { error } = await bobClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).toBeNull()
  })
})
