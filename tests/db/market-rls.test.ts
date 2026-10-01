import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('markets/market_outcomes/market_resolutions select policy', () => {
  it('an invited member can read markets and outcomes', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { data: markets, error: marketsErr } = await aliceClient.from('markets').select('id').eq('id', marketId)
    expect(marketsErr).toBeNull()
    expect(markets).toHaveLength(1)

    const { data: outcomes, error: outcomesErr } = await aliceClient
      .from('market_outcomes')
      .select('id')
      .eq('market_id', marketId)
    expect(outcomesErr).toBeNull()
    expect(outcomes).toHaveLength(2)
  })

  it('a non-invited authenticated session sees zero rows', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    // Bob is a seedMembers() fixture member -- never actually invited
    // (no allowed_emails row) -- so is_invited() is false for him,
    // exactly like Foundation's select_all_profiles behaves.
    const bobClient = await clientFor(bob)
    const { data, error } = await bobClient.from('markets').select('id').eq('id', marketId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('bets select policy', () => {
  it('shows an invited member every bet', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    for (const client of [aliceClient, bobClient]) await ensureInvited(client)
    const aliceBet = await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    expect(aliceBet.error).toBeNull()
    const bobBet = await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 10 })
    expect(bobBet.error).toBeNull()

    const { data, error } = await aliceClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    expect(new Set(data?.map((b) => b.profile_id))).toEqual(new Set([alice.id, bob.id]))
  })

  it('shows an uninvited session no bets', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
    await ensureInvited(aliceClient)
    const aliceBet = await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    expect(aliceBet.error).toBeNull()

    // Bob is a seedMembers() fixture member, never invited.
    const bobClient = await clientFor(bob)
    const { data, error } = await bobClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('shows an admin every bet', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    for (const client of [aliceClient, bobClient]) await ensureInvited(client)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 10 })

    await giveRole(alice, 'admin')
    const adminClient = await clientFor(alice)
    const { data, error } = await adminClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    const profileIds = new Set(data?.map((b) => b.profile_id))
    expect(profileIds.has(alice.id)).toBe(true)
    expect(profileIds.has(bob.id)).toBe(true)
  })
})

describe('direct table writes', () => {
  it('rejects a direct insert into markets, bypassing create_market', async () => {
    const aliceClient = await clientFor(alice)
    const { error } = await aliceClient.from('markets').insert({
      created_by: alice.id,
      title: 'Sneaky',
      kind: 'binary',
      close_at: new Date(Date.now() + 60_000).toISOString(),
    })
    expectError(error, { code: '42501', message: 'permission denied for table markets' })

    const db = serviceClient()
    const { count } = await db.from('markets').select('*', { count: 'exact', head: true }).eq('title', 'Sneaky')
    expect(count).toBe(0)
  })

  it('rejects a direct insert into bets, bypassing place_bet', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { error } = await aliceClient.from('bets').insert({
      market_id: marketId,
      outcome_id: outcomeIds[0],
      profile_id: alice.id,
      amount: 10,
    })
    expectError(error, { code: '42501', message: 'permission denied for table bets' })

    const db = serviceClient()
    const { count } = await db.from('bets').select('*', { count: 'exact', head: true }).eq('market_id', marketId)
    expect(count).toBe(0)
  })

  it('rejects a direct update to market_outcomes.pool_total, bypassing place_bet', async () => {
    const aliceClient = await clientFor(alice)
    const { outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { error } = await aliceClient.from('market_outcomes').update({ pool_total: 999 }).eq('id', outcomeIds[0])
    expectError(error, { code: '42501', message: 'permission denied for table market_outcomes' })
    expect(error?.code).toBe('42501')

    const db = serviceClient()
    const { data: outcome } = await db.from('market_outcomes').select('pool_total').eq('id', outcomeIds[0]).single()
    expect(outcome?.pool_total).toBe(0)
  })
})
