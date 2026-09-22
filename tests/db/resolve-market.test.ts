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

describe('resolve_market (admin override)', () => {
  it('reverses the prior payout exactly and re-resolves with the new outcome', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    // First resolution: "Yes" wins, Alice gets the whole pool.
    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    const { data: aliceAfterFirst } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfterFirst?.balance).toBe(100 - 20 + 50)

    // Admin override: it was actually "No" that won.
    await db.from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(error).toBeNull()

    const { data: aliceAfterOverride } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfterOverride?.balance).toBe(100 - 20) // her win is clawed back, her original bet stays spent

    const { data: bobAfterOverride } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobAfterOverride?.balance).toBe(100 - 30 + 50) // Bob now wins the whole pool

    const { data: resolutions } = await db
      .from('market_resolutions')
      .select('outcome_id, reversed_at')
      .eq('market_id', marketId)
      .order('resolved_at', { ascending: true })
    expect(resolutions).toHaveLength(2)
    expect(resolutions?.[0].outcome_id).toBe(outcomeIds[0])
    expect(resolutions?.[0].reversed_at).not.toBeNull()
    expect(resolutions?.[1].outcome_id).toBe(outcomeIds[1])
    expect(resolutions?.[1].reversed_at).toBeNull()
  })

  it('rejects a non-admin trying to change an already-resolved market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    // Alice is the creator, not an admin -- can't change it once resolved.
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(error).not.toBeNull()
  })

  it('fails atomically, changing nothing, if reversal would take a past winner negative', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    // Alice won 50 DC and immediately spends nearly all of it elsewhere,
    // so clawing back her win would take her negative.
    const { data: aliceBalance } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    await db.rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: -(aliceBalance!.balance - 5),
      p_type: 'test_spend',
    })

    await db.from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(error).not.toBeNull()

    // Nothing changed: original resolution still active, nobody's balance moved.
    const { data: market } = await db.from('markets').select('current_resolution_id').eq('id', marketId).single()
    const { data: resolution } = await db
      .from('market_resolutions')
      .select('outcome_id, reversed_at')
      .eq('id', market!.current_resolution_id)
      .single()
    expect(resolution?.outcome_id).toBe(outcomeIds[0])
    expect(resolution?.reversed_at).toBeNull()

    const { data: aliceAfter } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfter?.balance).toBe(5)
  })
})
