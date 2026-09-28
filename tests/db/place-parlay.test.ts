import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'

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

// Alice creates each market and seeds its pools; Bob places every parlay.
async function seededMarket(title: string, yes: number, no: number): Promise<TestMarket> {
  const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
  const seeds: [string, number][] = [
    [market.outcomeIds[0], yes],
    [market.outcomeIds[1], no],
  ]
  for (const [outcomeId, amount] of seeds) {
    if (amount === 0) continue
    const { error } = await aliceClient.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: outcomeId,
      p_amount: amount,
    })
    if (error) throw error
  }
  return market
}

async function bobBalance(): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
  if (error) throw error
  return data.balance
}

async function expectNothingPlaced(): Promise<void> {
  const db = serviceClient()
  const { count: parlayCount } = await db.from('parlays').select('*', { count: 'exact', head: true })
  expect(parlayCount).toBe(0)
  const { count: legCount } = await db.from('parlay_legs').select('*', { count: 'exact', head: true })
  expect(legCount).toBe(0)
  expect(await bobBalance()).toBe(100)
}

describe('place_parlay', () => {
  it("locks each leg's odds, debits the stake once, and leaves every pool untouched", async () => {
    const a = await seededMarket('Market A', 5, 15) // Yes locks at 20 / 5 = 4
    const b = await seededMarket('Market B', 10, 10) // Yes locks at 20 / 10 = 2

    const { data: parlayId, error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: parlay } = await db
      .from('parlays')
      .select('profile_id, stake, status, credited')
      .eq('id', parlayId as string)
      .single()
    expect(parlay).toEqual({ profile_id: bob.id, stake: 10, status: 'pending', credited: 0 })

    const { data: legs } = await db
      .from('parlay_legs')
      .select('market_id, outcome_id, locked_odds')
      .eq('parlay_id', parlayId as string)
    expect(legs).toHaveLength(2)
    const oddsByMarket = new Map(legs!.map((l) => [l.market_id, Number(l.locked_odds)]))
    expect(oddsByMarket.get(a.marketId)).toBe(4)
    expect(oddsByMarket.get(b.marketId)).toBe(2)

    expect(await bobBalance()).toBe(90)
    // Every fixture member also has a starting_grant row from the new-profile trigger.
    const { data: txns } = await db
      .from('coin_transactions')
      .select('amount, type, meta')
      .eq('profile_id', bob.id)
      .like('type', 'parlay_%')
    expect(txns).toEqual([{ amount: -10, type: 'parlay_placed', meta: { parlay_id: parlayId } }])

    const { data: pools } = await db
      .from('market_outcomes')
      .select('id, pool_total')
      .in('id', [...a.outcomeIds, ...b.outcomeIds])
    const poolById = new Map(pools!.map((p) => [p.id, p.pool_total]))
    expect(poolById.get(a.outcomeIds[0])).toBe(5)
    expect(poolById.get(a.outcomeIds[1])).toBe(15)
    expect(poolById.get(b.outcomeIds[0])).toBe(10)
    expect(poolById.get(b.outcomeIds[1])).toBe(10)
  })

  it('rejects fewer than 2 picks', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0]], p_stake: 10 })
    expect(error?.message).toContain('a parlay needs 2 to 10 picks')
    await expectNothingPlaced()
  })

  it('rejects more than 10 picks', async () => {
    const ids = Array.from({ length: 11 }, () => randomUUID())
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: ids, p_stake: 10 })
    expect(error?.message).toContain('a parlay needs 2 to 10 picks')
    await expectNothingPlaced()
  })

  it('rejects two picks from the same market', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: a.outcomeIds, p_stake: 10 })
    expect(error?.message).toContain('each pick must be from a different market')
    await expectNothingPlaced()
  })

  it('rejects the same outcome picked twice', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], a.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain('each pick must be from a different market')
    await expectNothingPlaced()
  })

  it('rejects an unknown outcome', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], randomUUID()],
      p_stake: 10,
    })
    expect(error?.message).toContain('outcome not found')
    await expectNothingPlaced()
  })

  it('rejects a market past its close time', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const b = await seededMarket('Market B', 5, 15)
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', b.marketId)

    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain("'Market B' is no longer open")
    await expectNothingPlaced()
  })

  it('rejects a voided market', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const b = await seededMarket('Market B', 5, 15)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
    expect(voidErr).toBeNull()

    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain("'Market B' is no longer open")
    await expectNothingPlaced()
  })

  it('rejects a resolved market', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const b = await seededMarket('Market B', 5, 15)
    await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
    const { error: resolveErr } = await aliceClient.rpc('resolve_market', {
      p_market_id: b.marketId,
      p_outcome_id: b.outcomeIds[0],
    })
    expect(resolveErr).toBeNull()

    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain("'Market B' is no longer open")
    await expectNothingPlaced()
  })

  it('rejects an outcome nobody has bet on yet', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const b = await seededMarket('Market B', 0, 10)

    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain("'Yes' has no bets yet")
    await expectNothingPlaced()
  })

  it('rejects a non-positive stake', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const b = await seededMarket('Market B', 5, 15)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 0,
    })
    expect(error?.message).toContain('stake must be positive')
    await expectNothingPlaced()
  })

  it('rejects a stake larger than the balance', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const b = await seededMarket('Market B', 5, 15)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 101,
    })
    expect(error).not.toBeNull()
    await expectNothingPlaced()
  })

  it('rejects a caller who is not invited', async () => {
    const a = await seededMarket('Market A', 5, 15)
    const b = await seededMarket('Market B', 5, 15)
    await serviceClient().from('allowed_emails').delete().eq('email', bob.email)

    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain('not invited')
    await expectNothingPlaced()
  })
})
