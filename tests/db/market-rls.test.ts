import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

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
  it("shows a member only their own bets", async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 10 })

    const { data, error } = await aliceClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    expect(data?.every((b) => b.profile_id === alice.id)).toBe(true)
  })

  it('shows an admin every bet', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 10 })

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
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
    expect(error).not.toBeNull()
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
    expect(error).not.toBeNull()

    const db = serviceClient()
    const { count } = await db.from('bets').select('*', { count: 'exact', head: true }).eq('market_id', marketId)
    expect(count).toBe(0)
  })
})
