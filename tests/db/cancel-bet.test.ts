import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole } from './fixtures'

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient
let market: TestMarket

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
  market = await createTestMarket(aliceClient, ['Yes', 'No'])
})

async function placeBet(client: TestClient, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[0],
    p_amount: amount,
  })
  if (error) throw error
  const { data, error: readErr } = await serviceClient()
    .from('bets')
    .select('id')
    .eq('market_id', market.marketId)
    .order('id', { ascending: false })
    .limit(1)
    .single()
  if (readErr) throw readErr
  return data.id as number
}

async function balanceOf(member: Member): Promise<number> {
  const { data } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  return data?.balance as number
}

async function poolOf(outcomeId: string): Promise<number> {
  const { data } = await serviceClient().from('market_outcomes').select('pool_total').eq('id', outcomeId).single()
  return data?.pool_total as number
}

describe('cancel_bet', () => {
  it('refunds the stake, shrinks the pool, and moves the bet to cancelled_bets', async () => {
    const betId = await placeBet(bobClient, 30)
    expect(await balanceOf(bob)).toBe(70)

    const { error } = await bobClient.rpc('cancel_bet', { p_bet_id: betId })
    expect(error).toBeNull()

    expect(await balanceOf(bob)).toBe(100)
    expect(await poolOf(market.outcomeIds[0])).toBe(0)

    const db = serviceClient()
    const { data: live } = await db.from('bets').select('id').eq('id', betId)
    expect(live).toEqual([])
    const { data: cancelled } = await db
      .from('cancelled_bets')
      .select('id, market_id, outcome_id, profile_id, amount')
      .eq('id', betId)
      .single()
    expect(cancelled).toEqual({
      id: betId,
      market_id: market.marketId,
      outcome_id: market.outcomeIds[0],
      profile_id: bob.id,
      amount: 30,
    })

    const { data: ledger } = await db
      .from('coin_transactions')
      .select('amount, type, meta')
      .eq('profile_id', bob.id)
      .eq('type', 'bet_cancelled')
    expect(ledger).toEqual([
      {
        amount: 30,
        type: 'bet_cancelled',
        meta: { market_id: market.marketId, outcome_id: market.outcomeIds[0], bet_id: betId },
      },
    ])
  })

  it("won't cancel another member's bet", async () => {
    const betId = await placeBet(bobClient, 30)

    const { error } = await aliceClient.rpc('cancel_bet', { p_bet_id: betId })
    expect(error?.message).toBe('bet not found')
    expect(await balanceOf(bob)).toBe(70)
    expect(await poolOf(market.outcomeIds[0])).toBe(30)
  })

  it('refuses once close_at has passed', async () => {
    const betId = await placeBet(bobClient, 30)
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', market.marketId)

    const { error } = await bobClient.rpc('cancel_bet', { p_bet_id: betId })
    expect(error?.message).toMatch(/closed/)
    expect(await balanceOf(bob)).toBe(70)
  })

  it('refuses on a voided market, which has already refunded the bet', async () => {
    const betId = await placeBet(bobClient, 30)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: market.marketId, p_reason: 'Voided in a test' })
    if (voidErr) throw voidErr

    const { error } = await bobClient.rpc('cancel_bet', { p_bet_id: betId })
    expect(error?.message).toMatch(/closed/)
    expect(await balanceOf(bob)).toBe(100)
  })

  it('refunds only once when the same bet is cancelled twice', async () => {
    const betId = await placeBet(bobClient, 30)

    const results = await Promise.all([
      bobClient.rpc('cancel_bet', { p_bet_id: betId }),
      bobClient.rpc('cancel_bet', { p_bet_id: betId }),
    ])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(await balanceOf(bob)).toBe(100)
    expect(await poolOf(market.outcomeIds[0])).toBe(0)
  })

  it("leaves a later resolution paying only the bets that weren't cancelled", async () => {
    const cancelledId = await placeBet(bobClient, 40)
    await placeBet(aliceClient, 10)
    const { error: cancelErr } = await bobClient.rpc('cancel_bet', { p_bet_id: cancelledId })
    if (cancelErr) throw cancelErr

    // Alice created the market and bet on it, so only as an admin can she resolve it (0046).
    await giveRole(alice, 'admin')
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', market.marketId)
    const { error } = await aliceClient.rpc('resolve_market', {
      p_note: 'Resolved in a test',
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
    })
    if (error) throw error

    // Bob's cancelled 40 took no part: Alice's 10 is the whole pool and comes straight back.
    expect(await balanceOf(bob)).toBe(100)
    expect(await balanceOf(alice)).toBe(100)
  })

  it('lets a member read cancelled bets but write none directly', async () => {
    const betId = await placeBet(bobClient, 30)
    const { error: cancelErr } = await bobClient.rpc('cancel_bet', { p_bet_id: betId })
    if (cancelErr) throw cancelErr
    await ensureInvited(aliceClient)

    const { data } = await aliceClient.from('cancelled_bets').select('id').eq('id', betId)
    expect(data).toEqual([{ id: betId }])

    const { error } = await bobClient.from('cancelled_bets').insert({
      id: 999999,
      market_id: market.marketId,
      outcome_id: market.outcomeIds[0],
      profile_id: bob.id,
      amount: 5,
      placed_at: new Date().toISOString(),
    })
    expectError(error, { code: '42501', message: 'permission denied for table cancelled_bets' })
  })
})
