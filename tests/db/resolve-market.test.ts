import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, giveRole } from './fixtures'
import type { SupabaseClient } from '@supabase/supabase-js'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  for (const m of [alice, bob]) await ensureInvited(await clientFor(m))
})

// A reviewer with no stake in the market. Since 0046 nobody but an admin resolves a market
// they've bet on, so the tests where Alice bets have this referee resolve instead.
async function referee(): Promise<SupabaseClient> {
  const carol = await makeMember('Carol')
  await giveRole(carol, 'reviewer')
  const client = await clientFor(carol)
  await ensureInvited(client)
  return client
}

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

    const { error } = await (await referee()).rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).toBeNull()

    const db = serviceClient()
    // Total pool 50, Alice's 20 was the entire winning pool -> she gets all 50.
    const { data: aliceProfile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceProfile?.balance).toBe(100 - 20 + 50)

    const { data: bobProfile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobProfile?.balance).toBe(100 - 30)

    const { data: market } = await db.from('markets').select('status, current_resolution_id, settled_at').eq('id', marketId).single()
    expect(market?.status).toBe('resolved')
    expect(market?.current_resolution_id).not.toBeNull()
    const { data: resolution } = await db.from('market_resolutions').select('resolved_at').eq('id', market!.current_resolution_id!).single()
    expect(market?.settled_at).toBe(resolution?.resolved_at)
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
    const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })
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
    const { error } = await bobClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).not.toBeNull()
  })

  it('rejects resolving before close_at for a non-admin', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 60_000 })

    const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).not.toBeNull()
  })

  it('lets an admin resolve before close_at', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 60_000 })

    await giveRole(bob, 'admin')
    const bobClient = await clientFor(bob)

    const { error } = await bobClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })
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
    await (await referee()).rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    const { data: aliceAfterFirst } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfterFirst?.balance).toBe(100 - 20 + 50)

    // Admin override: it was actually "No" that won.
    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[1] })
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

    // settled_at (0066) stays the first resolution's instant; the override only re-dates the resolution.
    const { data: market } = await db.from('markets').select('settled_at').eq('id', marketId).single()
    const { data: first } = await db.from('market_resolutions').select('resolved_at').eq('market_id', marketId).order('resolved_at').limit(1).single()
    expect(market?.settled_at).toBe(first?.resolved_at)
  })

  it('refuses an override to the outcome that already won, leaving the ledger alone (#198)', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })
    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)
    await (await referee()).rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('resolve_market', { p_note: 'Same again', p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error?.message).toBe('that outcome is already the result')

    const { data: resolutions } = await db.from('market_resolutions').select('id').eq('market_id', marketId)
    expect(resolutions).toHaveLength(1)
    const { data: reversals } = await db.from('coin_transactions').select('id').eq('type', 'resolution_reversed').eq('meta->>market_id', marketId)
    expect(reversals).toEqual([])
    const { data: aliceProfile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceProfile?.balance).toBe(100 - 20 + 50)

    // A different outcome still overrides.
    const { error: overrideErr } = await adminClient.rpc('resolve_market', { p_note: 'Actually No', p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(overrideErr).toBeNull()
  })

  it('rejects a non-admin trying to change an already-resolved market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    // Alice is the creator, not an admin -- can't change it once resolved.
    const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[1] })
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

    await (await referee()).rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    // Alice won 50 DC and immediately spends nearly all of it elsewhere,
    // so clawing back her win would take her negative.
    const { data: aliceBalance } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    await db.rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: -(aliceBalance!.balance - 5),
      p_type: 'test_spend',
    })

    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(error?.code).toBe('P0001')
    // 0033's clawback block: Alice owes her whole 50 DC win, and has only 5 left.
    expect(error?.message).toBe('clawback_short:[{"owed": 50, "balance": 5, "display_name": "Alice"}]')

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

  it('a second override reverses only the first override, not the original resolution', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'], { kind: 'multiple_choice' })

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 20 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    await (await referee()).rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)

    // First override: Red -> Blue. Pool is 30 (10 + 20); Red's reversal
    // takes back Alice's win of floor(10*30/10)=30, then Blue's only
    // bettor (Bob, 20) wins floor(20*30/20)=30.
    await adminClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    const { data: afterFirstOverride } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(afterFirstOverride?.balance).toBe(100 - 20 + 30) // Bob now winner of the 30-total pool

    // Second override: Blue -> Green (nobody bet Green, so this refunds everyone).
    const { error } = await adminClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeIds[2] })
    expect(error).toBeNull()

    const { data: aliceFinal } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    const { data: bobFinal } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    // Green has no bets, so resolve_market's refund branch pays back
    // every bet in the market (not just a share of the pool). Net effect
    // across each person's whole history (bet, win, reversal, refund)
    // is zero: Alice -10 (bet) +30 (win, reversed) -30 (reversal) +10
    // (refund) = 0; Bob -20 (bet) +30 (win) -30 (reversal) +20 (refund)
    // = 0. Both end back at their starting 100.
    expect(aliceFinal?.balance).toBe(100) // her original stake, refunded, never touched by either override's reversal
    expect(bobFinal?.balance).toBe(100) // his original stake, refunded; his first-override win was correctly clawed back exactly once

    const { data: resolutions } = await db
      .from('market_resolutions')
      .select('outcome_id, reversed_at')
      .eq('market_id', marketId)
      .order('resolved_at', { ascending: true })
    expect(resolutions).toHaveLength(3)
    expect(resolutions?.[0].reversed_at).not.toBeNull() // Red, reversed by first override
    expect(resolutions?.[1].reversed_at).not.toBeNull() // Blue, reversed by second override
    expect(resolutions?.[2].reversed_at).toBeNull() // Green, currently active
  })
})
