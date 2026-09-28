import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { lockedOddsToBp, potentialPayout } from '@/lib/parlays/odds'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  // Alice creates, seeds, resolves, overrides, and voids every market; as
  // an admin she can resolve before close_at and override a resolution.
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
})

// Every market is seeded 5 on its first outcome and 15 on its second:
// the first locks at 20 / 5 = 4x, the second at 20 / 15 = 4/3x.
async function seededMarket(
  title: string,
  labels: string[] = ['Yes', 'No'],
  pools: [number, number] = [5, 15],
): Promise<TestMarket> {
  const market = await createTestMarket(aliceClient, labels, { title })
  for (const [index, amount] of [
    [0, pools[0]],
    [1, pools[1]],
  ] as const) {
    const { error } = await aliceClient.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[index],
      p_amount: amount,
    })
    if (error) throw error
  }
  return market
}

async function placeParlay(outcomeIds: string[], stake: number): Promise<string> {
  const { data, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: stake })
  if (error) throw error
  return data as string
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

async function voidMarket(market: TestMarket): Promise<void> {
  const { error } = await aliceClient.rpc('void_market', { p_market_id: market.marketId })
  if (error) throw error
}

async function parlayRow(id: string): Promise<{ status: string; credited: number; settled_at: string | null }> {
  const { data, error } = await serviceClient()
    .from('parlays')
    .select('status, credited, settled_at')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

async function bobBalance(): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
  if (error) throw error
  return data.balance
}

// Parlay rows only: every fixture member also has a starting_grant row, and
// the clawback test gives Bob a single bet too.
async function bobTransactions(): Promise<{ amount: number; type: string }[]> {
  const { data, error } = await serviceClient()
    .from('coin_transactions')
    .select('amount, type')
    .eq('profile_id', bob.id)
    .like('type', 'parlay_%')
    .order('id', { ascending: true })
  if (error) throw error
  return data
}

describe('parlay settlement', () => {
  it('pays stake x the product of locked odds once every leg wins', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    await resolve(a, 0)
    expect((await parlayRow(id)).status).toBe('pending')

    await resolve(b, 0)
    const row = await parlayRow(id)
    expect(row.status).toBe('won')
    expect(row.credited).toBe(160)
    expect(row.settled_at).not.toBeNull()
    expect(await bobBalance()).toBe(100 - 10 + 160)
    expect(await bobTransactions()).toEqual([
      { amount: -10, type: 'parlay_placed' },
      { amount: 160, type: 'parlay_won' },
    ])
  })

  it('rounds the payout down', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    // (4/3) x (4/3) = 1.777..., x 10 = 17.77... -> 17
    const id = await placeParlay([a.outcomeIds[1], b.outcomeIds[1]], 10)

    await resolve(a, 1)
    await resolve(b, 1)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: 17 })
  })

  it('caps the multiplier at 20x', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const c = await seededMarket('Market C')
    // 4 x 4 x 4 = 64, capped to 20
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0], c.outcomeIds[0]], 10)

    await resolve(a, 0)
    await resolve(b, 0)
    await resolve(c, 0)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: 200 })
  })

  it('loses as soon as one leg loses, even with another leg still open, and stays lost', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    await resolve(a, 1)
    const row = await parlayRow(id)
    expect(row).toMatchObject({ status: 'lost', credited: 0 })
    expect(row.settled_at).not.toBeNull()
    expect(await bobBalance()).toBe(90)

    await resolve(b, 0)
    expect(await parlayRow(id)).toMatchObject({ status: 'lost', credited: 0 })
    expect(await bobTransactions()).toEqual([{ amount: -10, type: 'parlay_placed' }])
  })

  it('drops a voided leg and pays on the rest', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const c = await seededMarket('Market C')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0], c.outcomeIds[0]], 10)

    await voidMarket(c)
    await resolve(a, 0)
    await resolve(b, 0)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: 160 })
  })

  it('pays a single surviving leg at its locked odds', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    await voidMarket(b)
    await resolve(a, 0)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: 40 })
  })

  it('refunds the stake when every leg is voided', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    await voidMarket(a)
    expect((await parlayRow(id)).status).toBe('pending')

    await voidMarket(b)
    expect(await parlayRow(id)).toMatchObject({ status: 'refunded', credited: 10 })
    expect(await bobBalance()).toBe(100)
    expect(await bobTransactions()).toEqual([
      { amount: -10, type: 'parlay_placed' },
      { amount: 10, type: 'parlay_refunded' },
    ])
  })

  it('counts a leg as lost when nobody backed the winning outcome', async () => {
    const a = await seededMarket('Market A', ['Yes', 'No', 'Maybe'])
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    // "Maybe" has no bets, so resolve_market refunds every single bet on A.
    await resolve(a, 2)
    expect(await parlayRow(id)).toMatchObject({ status: 'lost', credited: 0 })
  })

  it('pays out when an override turns a losing leg into the pick', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    await resolve(a, 1)
    await resolve(b, 0)
    expect((await parlayRow(id)).status).toBe('lost')

    await resolve(a, 0)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: 160 })
    expect(await bobBalance()).toBe(100 - 10 + 160)
  })

  it('returns a parlay to pending when an override revives it while another leg is open', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    await resolve(a, 1)
    expect((await parlayRow(id)).status).toBe('lost')

    await resolve(a, 0)
    expect(await parlayRow(id)).toEqual({ status: 'pending', credited: 0, settled_at: null })
  })

  it('claws the payout back when an override turns a winning leg into a loss, without double-reversing', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    await resolve(a, 0)
    await resolve(b, 0)
    expect(await bobBalance()).toBe(250)

    await resolve(a, 1)
    expect(await parlayRow(id)).toMatchObject({ status: 'lost', credited: 0 })
    expect(await bobBalance()).toBe(90)
    // Exactly one reversal: resolve_market's own resolution_id-tagged
    // reversal must never also reverse the parlay's payout.
    expect(await bobTransactions()).toEqual([
      { amount: -10, type: 'parlay_placed' },
      { amount: 160, type: 'parlay_won' },
      { amount: -160, type: 'parlay_reversed' },
    ])
  })

  it('rolls the whole override back when the parlay clawback would go negative', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    await resolve(a, 0)
    await resolve(b, 0)
    expect(await bobBalance()).toBe(250)

    // Bob spends most of his winnings, so clawing back 160 would take him negative.
    const c = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market C' })
    const { error: betErr } = await bobClient.rpc('place_bet', {
      p_market_id: c.marketId,
      p_outcome_id: c.outcomeIds[0],
      p_amount: 200,
    })
    expect(betErr).toBeNull()
    expect(await bobBalance()).toBe(50)

    const db = serviceClient()
    const { data: before } = await db.from('markets').select('status, current_resolution_id').eq('id', a.marketId).single()
    const { data: aliceBefore } = await db.from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await aliceClient.rpc('resolve_market', {
      p_market_id: a.marketId,
      p_outcome_id: a.outcomeIds[1],
    })
    // 0033 blocks it up front, naming who's short, rather than failing on the balance check part-way.
    expect(error?.code).toBe('P0001')
    expect(error?.message).toBe('clawback_short:[{"owed": 160, "balance": 50, "display_name": "Bob"}]')

    const { data: after } = await db.from('markets').select('status, current_resolution_id').eq('id', a.marketId).single()
    expect(after).toEqual(before)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: 160 })
    expect(await bobBalance()).toBe(50)
    const { data: aliceAfter } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfter).toEqual(aliceBefore)
  })

  it('does not let a member call settle_parlay directly', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    // 42501 specifically: a missing function (PGRST202) must not pass this test.
    const { error } = await bobClient.rpc('settle_parlay', { p_parlay_id: id })
    expect(error?.code).toBe('42501')
  })

  it('pays exactly the payout the app displays', async () => {
    // 10/3 locks at 3.3333 and 3/1 at 3.0000: exact odds would be 10x; the locked product is 9.9999x.
    const a = await seededMarket('Market A', ['Yes', 'No'], [3, 7])
    const b = await seededMarket('Market B', ['Yes', 'No'], [1, 2])
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    const { data: legs } = await serviceClient().from('parlay_legs').select('locked_odds').eq('parlay_id', id)
    const legBps = legs!.map((l) => lockedOddsToBp(l.locked_odds))
    expect([...legBps].sort((x, y) => x - y)).toEqual([30_000, 33_333])
    const displayed = potentialPayout(10, legBps)
    expect(displayed).toBe(99)

    await resolve(a, 0)
    await resolve(b, 0)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: displayed })
  })

  it('writes no parlay transactions when a market is re-resolved to the same outcome', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    await resolve(a, 0)
    await resolve(b, 0)
    const before = await bobTransactions()

    await resolve(a, 0)
    expect(await bobTransactions()).toEqual(before)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: 160 })
  })
})
