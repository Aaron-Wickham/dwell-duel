import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import {
  seedMembers,
  clientFor,
  createTestMarket,
  ensureInvited,
  makeMember,
  type Member,
  type TestMarket,
} from './fixtures'
import { pgQuery } from './pg-query'
import { CLAWBACK_PREFIX } from '@/lib/markets/clawback'

let alice: Member
let bob: Member
let carol: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let carolClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  // Alice creates, resolves and overrides every market; as an admin she can resolve before close_at.
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  await ensureInvited(bobClient)
})

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number) {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number) {
  return aliceClient.rpc('resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex] })
}

async function balanceOf(member: Member): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  if (error) throw error
  return data.balance
}

// Leaves the member exactly `left` DC, as if they had spent the rest elsewhere.
async function spendDownTo(member: Member, left: number) {
  const { error } = await serviceClient().rpc('apply_coin_transaction', {
    p_profile_id: member.id,
    p_amount: left - (await balanceOf(member)),
    p_type: 'test_spend',
  })
  if (error) throw error
}

// Everything an override could touch: balances, the ledger, the market, its resolutions and parlays.
async function snapshot(market: TestMarket) {
  const db = serviceClient()
  const [profiles, ledger, markets, resolutions, parlays] = await Promise.all([
    db.from('profiles').select('id, balance').order('id'),
    db.from('coin_transactions').select('id, profile_id, amount, type').order('id'),
    db.from('markets').select('status, current_resolution_id').eq('id', market.marketId).single(),
    db.from('market_resolutions').select('id, outcome_id, reversed_at').eq('market_id', market.marketId).order('id'),
    db.from('parlays').select('id, status, credited').order('id'),
  ])
  for (const { error } of [profiles, ledger, markets, resolutions, parlays]) if (error) throw error
  return { profiles: profiles.data, ledger: ledger.data, market: markets.data, resolutions: resolutions.data, parlays: parlays.data }
}

function shortList(message: string | undefined): unknown {
  expect(message?.startsWith(CLAWBACK_PREFIX)).toBe(true)
  return JSON.parse(message!.slice(CLAWBACK_PREFIX.length))
}

describe('resolve_market override: resolution payouts', () => {
  // Pool 60: Bob 20 and Carol 10 on Yes, Alice 30 on No. Yes pays Bob 40 and Carol 20.
  async function resolvedYes(): Promise<TestMarket> {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 20)
    await bet(carolClient, market, 0, 10)
    await bet(aliceClient, market, 1, 30)
    const { error } = await resolve(market, 0)
    if (error) throw error
    return market
  }

  it('blocks the override, naming everyone short in name order, and changes nothing', async () => {
    const market = await resolvedYes()
    await spendDownTo(bob, 10)
    await spendDownTo(carol, 5)
    const before = await snapshot(market)

    const { error } = await resolve(market, 1)

    expect(error?.code).toBe('P0001')
    expect(shortList(error?.message)).toEqual([
      { display_name: 'Bob', owed: 40, balance: 10 },
      { display_name: 'Carol', owed: 20, balance: 5 },
    ])
    expect(await snapshot(market)).toEqual(before)
  })

  it('goes through as before when everyone can pay back, even with their last coin', async () => {
    const market = await resolvedYes()
    await spendDownTo(bob, 40)

    const { error } = await resolve(market, 1)

    expect(error).toBeNull()
    expect(await balanceOf(bob)).toBe(0)
    expect(await balanceOf(carol)).toBe(100 - 10)
    // Alice's 30 is now the whole winning pool, so she takes all 60.
    expect(await balanceOf(alice)).toBe(100 - 30 + 60)
    const { data: reversals, error: ledgerErr } = await serviceClient()
      .from('coin_transactions')
      .select('profile_id, amount')
      .eq('type', 'resolution_reversed')
    if (ledgerErr) throw ledgerErr
    expect(reversals).toHaveLength(2)
    expect(reversals).toEqual(
      expect.arrayContaining([
        { profile_id: bob.id, amount: -40 },
        { profile_id: carol.id, amount: -20 },
      ]),
    )
  })

  it('sums two winning bets on the same outcome for one member', async () => {
    // Pool 50: Bob 10 and 10 on Yes (two separate bets), Alice 30 on No. Yes pays
    // each of Bob's bets floor(10 * 50/20) = 25, so he owes 50 in total.
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 10)
    await bet(bobClient, market, 0, 10)
    await bet(aliceClient, market, 1, 30)
    const { error: resolveErr } = await resolve(market, 0)
    if (resolveErr) throw resolveErr
    await spendDownTo(bob, 30)

    const { error } = await resolve(market, 1)

    expect(error?.code).toBe('P0001')
    expect(shortList(error?.message)).toEqual([{ display_name: 'Bob', owed: 50, balance: 30 }])
  })
})

describe('resolve_market override: won parlays', () => {
  // Both markets are seeded 5 on Yes and 15 on No, so Yes locks at 4x and Bob's 10 DC parlay on
  // both Yeses pays 160 once they win.
  async function parlayOnBothYeses(): Promise<{ a: TestMarket; b: TestMarket; parlayId: string }> {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market B' })
    for (const market of [a, b]) {
      await bet(aliceClient, market, 0, 5)
      await bet(aliceClient, market, 1, 15)
    }
    const { data, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 10 })
    if (error) throw error
    return { a, b, parlayId: data as string }
  }

  async function resolveBothYes(a: TestMarket, b: TestMarket) {
    for (const market of [a, b]) {
      const { error } = await resolve(market, 0)
      if (error) throw error
    }
  }

  it('adds the parlay credit to what a member owes, blocks the override and changes nothing', async () => {
    const { a, b, parlayId } = await parlayOnBothYeses()
    // Bob also backs Yes on A directly: A's pool is then 25 with 10 on Yes, so Yes pays him 12.
    await bet(bobClient, a, 0, 5)
    await resolveBothYes(a, b)
    await spendDownTo(bob, 50)
    const before = await snapshot(a)
    expect(before.parlays).toEqual([{ id: parlayId, status: 'won', credited: 160 }])

    const { error } = await resolve(a, 1)

    expect(error?.code).toBe('P0001')
    // 12 from A's payout plus the parlay's 160. Alice owes A's other 12, which she has.
    expect(shortList(error?.message)).toEqual([{ display_name: 'Bob', owed: 172, balance: 50 }])
    expect(await snapshot(a)).toEqual(before)
  })

  it('reverses the parlay as before when the member can pay it back', async () => {
    const { a, b, parlayId } = await parlayOnBothYeses()
    await resolveBothYes(a, b)
    await spendDownTo(bob, 160)

    const { error } = await resolve(a, 1)

    expect(error).toBeNull()
    expect(await balanceOf(bob)).toBe(0)
    const { data: parlay } = await serviceClient().from('parlays').select('status, credited').eq('id', parlayId).single()
    expect(parlay).toEqual({ status: 'lost', credited: 0 })
    const { data: reversal } = await serviceClient()
      .from('coin_transactions')
      .select('amount')
      .eq('profile_id', bob.id)
      .eq('type', 'parlay_reversed')
    expect(reversal).toEqual([{ amount: -160 }])
  })
})

describe('resolve_market and void_market lock order', () => {
  async function definition(signature: string): Promise<string> {
    const [row] = await pgQuery<{ def: string }>(`select pg_get_functiondef('public.${signature}'::regprocedure) as def`)
    return row.def
  }

  // Every loop that credits or debits a member: the reversal, refund and payout loops.
  const memberLoops = (def: string) => def.match(/for v_(?:txn|bet) in\s+select[\s\S]*?\bloop\b/g) ?? []

  it('credits and debits members in profile order, so concurrent resolutions cannot deadlock', async () => {
    const resolveLoops = memberLoops(await definition('resolve_market(uuid,uuid)'))
    const voidLoops = memberLoops(await definition('void_market(uuid)'))

    expect(resolveLoops).toHaveLength(3)
    expect(voidLoops).toHaveLength(1)
    for (const loop of [...resolveLoops, ...voidLoops]) expect(loop).toContain('order by profile_id, id')
  })

  // Per-loop ordering alone isn't enough across phases (the clawback block,
  // the reversal, the payout/refund loop, settle_parlay's own locking): each
  // function locks every profile it could touch in one statement, ordered by
  // id, before the clawback block or any write. That up-front lock is what
  // actually rules out a cross-phase deadlock.
  const upfrontLock = /perform 1 from public\.profiles where id in \(\s*[\s\S]*?\) order by id for no key update;/

  it('locks every profile it could touch, in id order, in one statement before any write', async () => {
    const resolveDef = await definition('resolve_market(uuid,uuid)')
    const voidDef = await definition('void_market(uuid)')

    expect(resolveDef).toMatch(upfrontLock)
    expect(voidDef).toMatch(upfrontLock)

    // Neither function writes (update/insert into a real table) before that lock.
    const firstWriteIndex = (def: string) => def.search(/\n\s*(?:update|insert into)\s+public\./i)
    const lockIndex = (def: string) => def.search(upfrontLock)

    expect(lockIndex(resolveDef)).toBeGreaterThan(-1)
    expect(lockIndex(resolveDef)).toBeLessThan(firstWriteIndex(resolveDef))
    expect(lockIndex(voidDef)).toBeGreaterThan(-1)
    expect(lockIndex(voidDef)).toBeLessThan(firstWriteIndex(voidDef))
  })

  // The clawback block re-locks the owing members. It must use the same NO KEY UPDATE strength:
  // upgrading to FOR UPDATE would wait on other transactions' foreign-key KEY SHARE locks again.
  it('locks owing members in the clawback block with NO KEY UPDATE', async () => {
    expect(await definition('resolve_market(uuid,uuid)')).toMatch(/for no key update of p/)
  })
})
