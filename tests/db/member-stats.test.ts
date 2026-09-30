import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import {
  seedMembers,
  makeMember,
  clientFor,
  anonClient,
  createTestMarket,
  createTestTask,
  ensureInvited,
  type Member,
  type TestMarket, giveRole } from './fixtures'
import { pgQuery } from './pg-query'
import { readMemberStats, type MemberStats } from '@/lib/members/stats'

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
  // An admin, so she can resolve before close and override.
  await giveRole(alice, 'admin')
})

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex], p_amount: amount })
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

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_note: 'Resolved in a test',
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

async function parlay(client: SupabaseClient, outcomeIds: string[], stake: number): Promise<void> {
  const { error } = await client.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: stake })
  if (error) throw error
}

async function submitTask(title: string): Promise<string> {
  const { taskId } = await createTestTask(alice, { title, rewardAmount: 10 })
  const { data, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
  if (error) throw error
  return data as string
}

async function stats(client: SupabaseClient, profileId: string): Promise<MemberStats> {
  return readMemberStats(client as never, profileId)
}

describe('member_stats', () => {
  it('reports each figure for a scripted history', async () => {
    // Won: Bob's 20 on Yes against Carol's 30 pays floor(20 × 50 / 20) = 50, a gain of 30.
    const won = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob wins this one' })
    await bet(bobClient, won, 0, 20)
    await bet(carolClient, won, 1, 30)
    await resolve(won, 0)

    // Lost.
    const lost = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, lost, 0, 10)
    await bet(carolClient, lost, 1, 10)
    await resolve(lost, 1)

    // Refunded: the market is voided.
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, voided, 0, 15)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId })
    if (voidErr) throw voidErr

    // Overridden: Bob first wins 50 on 10 (a gain of 40, which would be his biggest), then an
    // override hands it to Carol. It's a loss, and the reversed payout is no one's biggest win.
    const overridden = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Overridden' })
    await bet(bobClient, overridden, 0, 10)
    await bet(carolClient, overridden, 1, 40)
    await resolve(overridden, 0)
    await resolve(overridden, 1)

    // A won parlay at 3.00× and 2.00× (seeded, nobody else betting): 6.00×, paying 60 on 10.
    const three = await createTestMarket(aliceClient, ['A', 'B', 'C'], { seed: 20 })
    const two = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await parlay(bobClient, [three.outcomeIds[0], two.outcomeIds[0]], 10)
    await resolve(three, 0)
    await resolve(two, 0)

    // A lost parlay: one leg loses while the other is still open.
    const lostLeg = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const stillOpen = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await parlay(bobClient, [lostLeg.outcomeIds[0], stillOpen.outcomeIds[0]], 10)
    await resolve(lostLeg, 1)

    // An open bet is in no record, but its stake counts against net profit until it settles; a
    // cancelled bet is in neither.
    await bet(bobClient, stillOpen, 0, 5)
    const cancelled = await bet(bobClient, stillOpen, 1, 7)
    const { error: cancelErr } = await bobClient.rpc('cancel_bet', { p_bet_id: cancelled })
    if (cancelErr) throw cancelErr

    // Markets Bob created: two, whatever becomes of them.
    await createTestMarket(bobClient, ['Yes', 'No'])
    await createTestMarket(bobClient, ['Yes', 'No'])

    // Tasks: two approved, one rejected, one pending. Only the approved count.
    for (const title of ['Read Psalm 23', 'Read John 1']) {
      const { error } = await aliceClient.rpc('approve_task_completion', { p_completion_id: await submitTask(title) })
      if (error) throw error
    }
    const { error: rejectErr } = await aliceClient.rpc('reject_task_completion', {
      p_completion_id: await submitTask('Memorise a verse'),
      p_reason: 'Not yet',
    })
    if (rejectErr) throw rejectErr
    await submitTask('Pray for a friend')

    // Won +30, lost −10, voided 0, overridden −10, won parlay +50, lost parlay −10, open −5,
    // cancelled 0.
    const expected: MemberStats = {
      bets: { won: 1, lost: 2, refunded: 1 },
      parlays: { won: 1, lost: 1, refunded: 0 },
      settled: 6,
      netProfit: 45,
      biggestWin: { amount: 30, marketId: won.marketId, marketTitle: 'Bob wins this one' },
      bestParlay: { multiplierBp: 60_000, payout: 60 },
      marketsCreated: 2,
      tasksCompleted: 2,
    }
    // Anyone invited sees the same figures, Bob included.
    expect(await stats(carolClient, bob.id)).toEqual(expected)
    expect(await stats(bobClient, bob.id)).toEqual(expected)

    // Net profit is the This month board's classification summed over all time.
    const [ledger] = await pgQuery<{ total: string }>(
      `select sum(amount)::text as total from public.coin_transactions where profile_id = '${bob.id}' and type = any(public.betting_ledger_types())`,
    )
    expect(Number(ledger.total)).toBe(45)
  })

  it('counts a market resolved to an outcome nobody backed as refunded, not lost', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 10)
    await resolve(market, 1)
    expect((await stats(carolClient, bob.id)).bets).toEqual({ won: 0, lost: 0, refunded: 1 })
  })

  it('is all zeros for a member with no history', async () => {
    expect(await stats(bobClient, carol.id)).toEqual({
      bets: { won: 0, lost: 0, refunded: 0 },
      parlays: { won: 0, lost: 0, refunded: 0 },
      settled: 0,
      netProfit: 0,
      biggestWin: null,
      bestParlay: null,
      marketsCreated: 0,
      tasksCompleted: 0,
    })
  })

  it('refuses an uninvited session and anon', async () => {
    const dave = await makeMember('Dave')
    const { data, error } = await (await clientFor(dave)).rpc('member_stats', { p_profile_id: bob.id })
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
    expect(error?.message).toBe('not invited')

    const { error: anonErr } = await anonClient().rpc('member_stats', { p_profile_id: bob.id })
    expect(anonErr?.code).toBe('42501')
  })

  it('keeps betting_ledger_types to itself', async () => {
    const { error } = await bobClient.rpc('betting_ledger_types')
    expect(error?.code).toBe('42501')
  })
})
