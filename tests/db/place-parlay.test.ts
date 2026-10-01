import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole, backers } from './fixtures'

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

// Alice creates each market; Backer1 stakes `yes` on Yes and Backer2 `no` on No; Bob places every
// parlay.
async function seededMarket(title: string, yes: number, no: number): Promise<TestMarket> {
  const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
  const [first, second] = await backers()
  const seeds: [TestClient, string, number][] = [
    [first.client, market.outcomeIds[0], yes],
    [second.client, market.outcomeIds[1], no],
  ]
  for (const [client, outcomeId, amount] of seeds) {
    if (amount === 0) continue
    const { error } = await client.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: outcomeId,
      p_amount: amount,
    })
    if (error) throw error
  }
  return market
}

async function bet(client: TestClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
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

async function expectRefused(outcomeIds: string[], message: string): Promise<void> {
  const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: 10 })
  expectError(error, message)
  await expectNothingPlaced()
}

describe('place_parlay', () => {
  it('leaves each leg unpriced until its market closes, debits the stake once, and leaves every pool untouched', async () => {
    const a = await seededMarket('Market A', 15, 45)
    const b = await seededMarket('Market B', 30, 30)

    const { data: parlayId, error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: parlay } = await db
      .from('parlays')
      .select('profile_id, stake, status, credited, max_multiplier')
      .eq('id', parlayId as string)
      .single()
    expect(parlay).toEqual({ profile_id: bob.id, stake: 10, status: 'pending', credited: 0, max_multiplier: 20 })

    const { data: legs } = await db
      .from('parlay_legs')
      .select('market_id, outcome_id, locked_odds')
      .eq('parlay_id', parlayId as string)
    expect(legs).toHaveLength(2)
    expect(legs!.map((l) => l.locked_odds)).toEqual([null, null])

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
    expect(poolById.get(a.outcomeIds[0])).toBe(15)
    expect(poolById.get(a.outcomeIds[1])).toBe(45)
    expect(poolById.get(b.outcomeIds[0])).toBe(30)
    expect(poolById.get(b.outcomeIds[1])).toBe(30)
  })

  it('rejects fewer than 2 picks', async () => {
    const a = await seededMarket('Market A', 25, 25)
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
    const a = await seededMarket('Market A', 25, 25)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: a.outcomeIds, p_stake: 10 })
    expect(error?.message).toContain('each pick must be from a different market')
    await expectNothingPlaced()
  })

  it('rejects the same outcome picked twice', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], a.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain('each pick must be from a different market')
    await expectNothingPlaced()
  })

  it('rejects an unknown outcome', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], randomUUID()],
      p_stake: 10,
    })
    expect(error?.message).toContain('outcome not found')
    await expectNothingPlaced()
  })

  it('rejects a market past its close time', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 25, 25)
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
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 25, 25)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId, p_reason: 'Voided in a test' })
    expect(voidErr).toBeNull()

    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain("'Market B' is no longer open")
    await expectNothingPlaced()
  })

  it('rejects a resolved market', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 25, 25)
    await giveRole(alice, 'admin')
    const { error: resolveErr } = await aliceClient.rpc('resolve_market', {
      p_note: 'Resolved in a test',
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

  it('refuses a leg whose market has under 50 DC from other members', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 24, 25)
    await expectRefused([a.outcomeIds[0], b.outcomeIds[0]], "'Market B' needs at least 50 DC from 2 other members before it can be a parlay pick")
  })

  it('refuses a leg whose market has 50 DC from only one other member', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 60, 0)
    await expectRefused([a.outcomeIds[0], b.outcomeIds[0]], "'Market B' needs at least 50 DC from 2 other members before it can be a parlay pick")
  })

  it('leaves the bettor’s own stakes out of the floor', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 20, 0)
    // Bob's own 40 would make 60 DC from two members, but only other members' money counts.
    await bet(bobClient, b, 1, 40)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 10 })
    expectError(error, "'Market B' needs at least 50 DC from 2 other members")
    const { count } = await serviceClient().from('parlays').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)
  })

  it('accepts a leg on an outcome nobody else has backed, once the market meets the floor', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 0, 0)
    await bet(aliceClient, b, 1, 25)
    await bet((await backers())[1].client, b, 1, 25)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 10 })
    expect(error).toBeNull()
  })

  it('refuses a leg on a market the bettor created', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const own = await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Bob’s market' })
    await bet(aliceClient, own, 0, 30)
    await bet((await backers())[0].client, own, 1, 30)
    await expectRefused([a.outcomeIds[0], own.outcomeIds[0]], "'Bob’s market' is your own market, so it can't be a parlay pick")
  })

  it('refuses a stake over the 1,000 DC payout cap', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 25, 25)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 1001 })
    expectError(error, 'a parlay pays at most 1000 DC, so its stake can be at most 1000 DC')
    await expectNothingPlaced()
  })

  it('rejects a non-positive stake', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 25, 25)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 0,
    })
    expect(error?.message).toContain('stake must be positive')
    await expectNothingPlaced()
  })

  it('rejects a stake larger than the balance', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 25, 25)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 101,
    })
    expectError(error, { code: '23514', message: 'profiles_balance_check' })
    await expectNothingPlaced()
  })

  it('rejects a caller who is not invited', async () => {
    const a = await seededMarket('Market A', 25, 25)
    const b = await seededMarket('Market B', 25, 25)
    await serviceClient().from('allowed_emails').delete().eq('email', bob.email)

    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error?.message).toContain('not invited')
    await expectNothingPlaced()
  })
})
