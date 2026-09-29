import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { combineOdds, formatOdds, lockedOddsToBp } from '@/lib/parlays/odds'
import { getParlayDetail } from '@/lib/parlays/get-parlay'
import { readMemberStats } from '@/lib/members/stats'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, anonClient, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'

let alice: Member
let bob: Member
let carol: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let carolClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  for (const client of [aliceClient, bobClient, carolClient]) await ensureInvited(client)
  // An admin, so she can resolve before a market closes.
  const { error } = await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
  if (error) throw error
})

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex], p_amount: amount })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_note: 'Resolved in a test',
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

type Award = { kind: string; profile_id: string; display_name: string; value: string | number; detail: string | null }

async function awards(client: SupabaseClient): Promise<Award[]> {
  const { data, error } = await client.rpc('leaderboard_awards')
  if (error) throw error
  return data as Award[]
}

const award = (rows: Award[], kind: string) => rows.find((r) => r.kind === kind)

describe('access', () => {
  it('refuses anonymous callers and members who are not on the invite list', async () => {
    for (const [fn, args] of [
      ['leaderboard_race', undefined],
      ['leaderboard_race_steps', undefined],
      ['leaderboard_awards', undefined],
      ['member_records', { p_ids: [alice.id] }],
    ] as const) {
      const anon = await anonClient().rpc(fn, args)
      expect(anon.error, fn).not.toBeNull()
    }
    const outsider = await makeMember('Dave')
    const outsiderClient = await clientFor(outsider)
    for (const [fn, args] of [
      ['leaderboard_race', undefined],
      ['leaderboard_race_steps', undefined],
      ['leaderboard_awards', undefined],
      ['member_records', { p_ids: [alice.id] }],
    ] as const) {
      const { error } = await outsiderClient.rpc(fn, args)
      expect(error?.code, fn).toBe('42501')
    }
  })
})

describe('leaderboard_awards', () => {
  it('is empty before anyone has bet', async () => {
    expect(await awards(bobClient)).toEqual([])
  })

  it('names the biggest win, best parlay, sharpshooter and most active member of the month', async () => {
    // Bob's 20 on Yes against Carol's 30 pays floor(20 × 50 / 20) = 50: a gain of 30.
    const big = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob wins this one' })
    await bet(bobClient, big, 0, 20)
    await bet(carolClient, big, 1, 30)
    await resolve(big, 0)

    // A parlay at 3.00× and 2.00×, seeded, so 6.00×, paying 60 on 10.
    const three = await createTestMarket(aliceClient, ['A', 'B', 'C'], { seed: 20 })
    const two = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const { error } = await carolClient.rpc('place_parlay', { p_outcome_ids: [three.outcomeIds[0], two.outcomeIds[0]], p_stake: 10 })
    if (error) throw error
    await resolve(three, 0)
    await resolve(two, 0)

    const rows = await awards(aliceClient)
    expect(award(rows, 'biggest_win')).toMatchObject({ profile_id: bob.id, display_name: 'Bob', detail: 'Bob wins this one' })
    expect(Number(award(rows, 'biggest_win')?.value)).toBe(30)
    expect(award(rows, 'best_parlay')).toMatchObject({ profile_id: carol.id })
    expect(Number(award(rows, 'best_parlay')?.value)).toBe(6)
    // Nobody has five decided bets yet.
    expect(award(rows, 'sharpshooter')).toBeUndefined()
    // Bob and Carol have one bet each and Carol a parlay, so Carol is most active.
    expect(award(rows, 'most_active')).toMatchObject({ profile_id: carol.id })
    expect(Number(award(rows, 'most_active')?.value)).toBe(2)
  })

  it('gives best parlay the multiplier the parlay page and the Stats card show, not the floored payout over the stake', async () => {
    // Bob's 30 on Yes leaves it 50 of 70 seeded: 1.40×. The other leg is 2.00×, and a third is voided
    // and drops out. 3 DC at 2.80× pays floor(8.4) = 8, which is only 2.66× the stake.
    const skewed = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(bobClient, skewed, 0, 30)
    const even = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const { data: parlayId, error } = await carolClient.rpc('place_parlay', {
      p_outcome_ids: [skewed.outcomeIds[0], even.outcomeIds[0], voided.outcomeIds[0]],
      p_stake: 3,
    })
    if (error) throw error
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId })
    if (voidErr) throw voidErr
    await resolve(skewed, 0)
    await resolve(even, 0)

    const detail = await getParlayDetail(carolClient, parlayId as string)
    expect(detail).toMatchObject({ status: 'won', credited: 8 })
    const shown = combineOdds(detail!.legs.filter((l) => l.status !== 'voided').map((l) => l.lockedOddsBp)).multiplierBp
    expect(shown).toBe(detail!.multiplierBp)
    expect(formatOdds(shown)).toBe('2.80')

    const best = award(await awards(aliceClient), 'best_parlay')
    expect(best).toMatchObject({ profile_id: carol.id })
    expect(lockedOddsToBp(best!.value)).toBe(shown)
    const stats = await readMemberStats(bobClient, carol.id)
    expect(stats.bestParlay?.multiplierBp).toBe(shown)
  })

  it('gives sharpshooter to the best hit rate over at least five decided bets, and takes back an overridden win', async () => {
    const markets: TestMarket[] = []
    for (let i = 0; i < 5; i++) markets.push(await createTestMarket(aliceClient, ['Yes', 'No']))
    for (const m of markets) {
      await bet(bobClient, m, 0, 5)
      await bet(carolClient, m, 1, 5)
    }
    // Bob wins four of five; Carol the other one.
    for (let i = 0; i < 4; i++) await resolve(markets[i], 0)
    await resolve(markets[4], 1)

    const rows = await awards(aliceClient)
    expect(award(rows, 'sharpshooter')).toMatchObject({ profile_id: bob.id, detail: '4 of 5' })
    expect(Number(award(rows, 'sharpshooter')?.value)).toBeCloseTo(0.8)

    // An override hands the fourth market to Carol: Bob is now 3 of 5.
    await resolve(markets[3], 1)
    expect(award(await awards(aliceClient), 'sharpshooter')).toMatchObject({ profile_id: bob.id, detail: '3 of 5' })
  })
})

describe('member_records', () => {
  it('counts settled solo wins and losses and parlays, not open, voided or refunded bets', async () => {
    const won = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, won, 0, 10)
    await bet(carolClient, won, 1, 10)
    await resolve(won, 0)

    const open = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, open, 0, 10)

    const voided = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, voided, 0, 10)
    const { error } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId })
    if (error) throw error

    const { data, error: readErr } = await bobClient.rpc('member_records', { p_ids: [bob.id, carol.id, alice.id] })
    if (readErr) throw readErr
    const byId = new Map((data as { profile_id: string; won: number; lost: number }[]).map((r) => [r.profile_id, r]))
    expect(byId.get(bob.id)).toMatchObject({ won: 1, lost: 0 })
    expect(byId.get(carol.id)).toMatchObject({ won: 0, lost: 1 })
    expect(byId.get(alice.id)).toMatchObject({ won: 0, lost: 0 })
  })
})

describe('leaderboard_race', () => {
  it('draws each of the top members from the first day of the month to today, cumulative', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 20)
    await bet(carolClient, market, 1, 20)
    await resolve(market, 0)

    const { data, error } = await bobClient.rpc('leaderboard_race', { p_top: 2 })
    if (error) throw error
    const rows = data as { profile_id: string; display_name: string; day: string; profit: string | number }[]
    const byMember = new Map<string, typeof rows>()
    for (const r of rows) byMember.set(r.profile_id, [...(byMember.get(r.profile_id) ?? []), r])
    expect([...byMember.keys()].sort()).toEqual([bob.id, carol.id].sort())

    const now = new Date()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now)
    for (const series of byMember.values()) {
      expect(series.at(-1)?.day).toBe(today)
      expect(series[0].day.slice(8)).toBe('01')
      // Consecutive days, so a line spans the whole month so far.
      expect(series).toHaveLength(Number(today.slice(8)))
    }
    // Bob won 20 and Carol lost 20, so by today they stand at +20 and -20.
    expect(Number(byMember.get(bob.id)?.at(-1)?.profit)).toBe(20)
    expect(Number(byMember.get(carol.id)?.at(-1)?.profit)).toBe(-20)
  })

  it('caps the lines at eight', async () => {
    const { error } = await bobClient.rpc('leaderboard_race', { p_top: 99 })
    expect(error).toBeNull()
  })
})

type Step = { profile_id: string; display_name: string; step: number; at: string; profit: string | number }

async function steps(client: SupabaseClient, top = 5): Promise<Map<string, Step[]>> {
  const { data, error } = await client.rpc('leaderboard_race_steps', { p_top: top })
  if (error) throw error
  const byMember = new Map<string, Step[]>()
  for (const r of data as Step[]) byMember.set(r.profile_id, [...(byMember.get(r.profile_id) ?? []), r])
  return byMember
}

describe('leaderboard_race_steps', () => {
  it('has nothing to draw until a bet settles, however many are placed', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 20)
    await bet(carolClient, market, 1, 20)
    expect((await steps(bobClient)).size).toBe(0)
  })

  it('starts at the first settled bet, where stakes already placed stand, and steps at each move after', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 20)
    await bet(carolClient, market, 1, 20)
    await resolve(market, 0)
    const later = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, later, 0, 5)

    const { data: resolution, error } = await serviceClient()
      .from('market_resolutions')
      .select('resolved_at')
      .eq('market_id', market.marketId)
      .single()
    if (error) throw error

    const byMember = await steps(bobClient, 2)
    expect([...byMember.keys()].sort()).toEqual([bob.id, carol.id].sort())
    const bobSteps = byMember.get(bob.id)!
    const carolSteps = byMember.get(carol.id)!
    // Every member has a point at every step, in order.
    expect(bobSteps.map((s) => s.step)).toEqual([0, 1, 2])
    expect(carolSteps.map((s) => s.at)).toEqual(bobSteps.map((s) => s.at))

    // Step 0 is the first settlement's moment, before it paid: both stakes out.
    expect(Date.parse(bobSteps[0].at)).toBe(Date.parse(resolution.resolved_at))
    expect(bobSteps.map((s) => Number(s.profit))).toEqual([-20, 20, 15])
    // Carol's loss had no ledger row of its own; her stake left at placement.
    expect(carolSteps.map((s) => Number(s.profit))).toEqual([-20, -20, -20])
    expect(Date.parse(bobSteps[2].at)).toBeGreaterThan(Date.parse(bobSteps[1].at))
  })

  it('starts at a void\'s refunds too', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 20)
    const { error } = await aliceClient.rpc('void_market', { p_market_id: market.marketId })
    if (error) throw error
    const bobSteps = (await steps(bobClient)).get(bob.id)!
    expect(bobSteps.map((s) => Number(s.profit))).toEqual([-20, 0])
  })
})
