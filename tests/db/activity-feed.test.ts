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

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(aliceClient)
  await ensureInvited(bobClient)
  // Alice is an admin so she can resolve before close_at, override, and review tasks.
  await giveRole(alice, 'admin')
})

interface FeedRow {
  id: string
  kind: string
  actor_id: string
  actor_name: string
  market_id: string | null
  market_title: string | null
  outcome_label: string | null
  amount: number | null
  leg_count: number | null
  task_title: string | null
}

// 0036 closed the view to members and anon; it stays as the equivalence oracle, read here through
// the service role. The view is security_invoker, so the service role's own bypass of RLS means
// it shows every row, which is what an invited member saw before the revoke. What each member
// may see is activity_events' RLS, and that's asserted on activity_events itself.
async function feed(actorId?: string): Promise<FeedRow[]> {
  let query = serviceClient()
    .from('activity_feed')
    .select('id, kind, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
  if (actorId) query = query.eq('actor_id', actorId)
  const { data, error } = await query
  if (error) throw error
  return data as FeedRow[]
}

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
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

describe('activity_feed', () => {
  it('shows a created market and a placed bet with their details', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Feed market' })
    await bet(bobClient, market, 0, 7)

    const rows = await feed()
    expect(rows).toContainEqual(
      expect.objectContaining({
        kind: 'market_created',
        actor_id: alice.id,
        actor_name: 'Alice',
        market_id: market.marketId,
        market_title: 'Feed market',
        amount: null,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        kind: 'bet_placed',
        actor_id: bob.id,
        actor_name: 'Bob',
        market_id: market.marketId,
        market_title: 'Feed market',
        outcome_label: 'Yes',
        amount: 7,
        leg_count: null,
        task_title: null,
      }),
    )
  })

  it('shows a placed parlay with its pick count', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market B' })
    await bet(aliceClient, a, 0, 5)
    await bet(aliceClient, b, 0, 5)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error).toBeNull()

    expect(await feed()).toContainEqual(
      expect.objectContaining({ kind: 'parlay_placed', actor_id: bob.id, amount: 10, leg_count: 2, market_id: null }),
    )
  })

  it("shows a resolution and each winner's payout, matching what the ledger paid", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Payout market' })
    await bet(aliceClient, market, 1, 10)
    await bet(bobClient, market, 0, 3)
    await bet(aliceClient, market, 0, 4)
    await resolve(market, 0)

    const rows = await feed()
    expect(rows).toContainEqual(
      expect.objectContaining({ kind: 'market_resolved', actor_id: alice.id, market_id: market.marketId, outcome_label: 'Yes' }),
    )

    // Pool 17, winning pool 7: Bob floor(3 × 17 / 7) = 7, Alice floor(4 × 17 / 7) = 9.
    const wins = rows.filter((r) => r.kind === 'bet_won' && r.market_id === market.marketId)
    const { data: ledger } = await serviceClient()
      .from('coin_transactions')
      .select('profile_id, amount')
      .eq('type', 'bet_won')
      .eq('meta->>market_id', market.marketId)
    const byProfile = (list: { profile_id?: string; actor_id?: string; amount: number | null }[]) =>
      Object.fromEntries(list.map((x) => [x.profile_id ?? x.actor_id, x.amount]))
    expect(byProfile(wins)).toEqual({ [bob.id]: 7, [alice.id]: 9 })
    expect(byProfile(ledger!)).toEqual(byProfile(wins))
  })

  it('drops an overridden resolution and its wins, and shows the new ones', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Override market' })
    await bet(bobClient, market, 0, 5)
    await bet(aliceClient, market, 1, 15)
    await resolve(market, 0)
    await resolve(market, 1)

    const rows = (await feed()).filter((r) => r.market_id === market.marketId)
    const resolutions = rows.filter((r) => r.kind === 'market_resolved')
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0].outcome_label).toBe('No')

    const wins = rows.filter((r) => r.kind === 'bet_won')
    expect(wins).toEqual([expect.objectContaining({ actor_id: alice.id, amount: 20 })])
  })

  it('shows no wins for a voided market or one nobody backed', async () => {
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided market' })
    await bet(bobClient, voided, 0, 5)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId })
    expect(voidErr).toBeNull()

    const unbacked = await createTestMarket(aliceClient, ['Yes', 'No', 'Maybe'], { title: 'Unbacked market' })
    await bet(bobClient, unbacked, 0, 5)
    await resolve(unbacked, 2)

    const rows = await feed()
    expect(rows.filter((r) => r.kind === 'bet_won')).toEqual([])
    expect(rows.filter((r) => r.market_id === voided.marketId).map((r) => r.kind).sort()).toEqual([
      'bet_placed',
      'market_created',
    ])
    expect(rows).toContainEqual(
      expect.objectContaining({ kind: 'market_resolved', market_id: unbacked.marketId, outcome_label: 'Maybe' }),
    )
  })

  it('shows a won parlay with its payout', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market B' })
    for (const m of [a, b]) {
      await bet(aliceClient, m, 0, 5)
      await bet(aliceClient, m, 1, 15)
    }
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error).toBeNull()
    await resolve(a, 0)
    await resolve(b, 0)

    expect(await feed()).toContainEqual(
      expect.objectContaining({ kind: 'parlay_won', actor_id: bob.id, amount: 160, leg_count: 2 }),
    )
  })

  it('shows approved task completions, and every invited member sees them in activity_events, but no pending or rejected ones', async () => {
    const approvedTask = await createTestTask(alice, { title: 'Read Psalm 1', rewardAmount: 12 })
    const rejectedTask = await createTestTask(alice, { title: 'Rejected task' })
    const pendingTask = await createTestTask(alice, { title: 'Pending task' })
    const submit = async (taskId: string): Promise<string> => {
      const { data, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
      if (error) throw error
      return data as string
    }
    const approvedId = await submit(approvedTask.taskId)
    const rejectedId = await submit(rejectedTask.taskId)
    await submit(pendingTask.taskId)
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: approvedId })).error).toBeNull()
    expect((await aliceClient.rpc('reject_task_completion', { p_completion_id: rejectedId, p_reason: null })).error).toBeNull()

    expect((await feed()).filter((r) => r.kind === 'task_completed')).toEqual([
      expect.objectContaining({ id: `task:${approvedId}`, actor_id: bob.id, actor_name: 'Bob', task_title: 'Read Psalm 1', amount: 12 }),
    ])

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    await ensureInvited(carolClient)

    for (const viewer of [carolClient, bobClient]) {
      const { data, error } = await viewer.from('activity_events').select('id, actor_id, amount').eq('kind', 'task_completed')
      expect(error).toBeNull()
      expect(data).toEqual([{ id: `task:${approvedId}`, actor_id: bob.id, amount: 12 }])
    }
  })

  it('filters to one member', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Filter market' })
    await bet(bobClient, market, 0, 5)
    await bet(aliceClient, market, 1, 5)

    const rows = await feed(alice.id)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.actor_id === alice.id)).toBe(true)
    expect(rows.map((r) => r.kind).sort()).toEqual(['bet_placed', 'market_created'])
  })

  it('is closed to members and anon, and open to the service role', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Closed view market' })
    await bet(bobClient, market, 0, 5)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    // An invited admin, an invited member, an uninvited member and a signed-out session alike.
    for (const client of [aliceClient, bobClient, carolClient, anonClient()]) {
      const { data, error } = await client.from('activity_feed').select('id')
      expect(error?.code).toBe('42501')
      expect(data).toBeNull()
    }

    const [grants] = await pgQuery<Record<string, boolean>>(`
      select
        has_table_privilege('authenticated', 'public.activity_feed', 'select, insert, update, delete') as authenticated,
        has_table_privilege('anon', 'public.activity_feed', 'select, insert, update, delete') as anon,
        has_table_privilege('service_role', 'public.activity_feed', 'select') as service_role
    `)
    expect(grants).toEqual({ authenticated: false, anon: false, service_role: true })

    expect((await feed()).map((r) => r.kind).sort()).toEqual(['bet_placed', 'market_created'])
  })

  it('dates each event from its source column', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Dated A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Dated B' })
    for (const m of [a, b]) {
      await bet(aliceClient, m, 0, 5)
      await bet(aliceClient, m, 1, 15)
    }
    const { data: parlayId, error: parlayErr } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(parlayErr).toBeNull()
    await resolve(a, 0)
    await resolve(b, 0)

    const { taskId } = await createTestTask(alice, { title: 'Dated task' })
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    const { data: rows, error } = await serviceClient().from('activity_feed').select('kind, market_id, occurred_at')
    expect(error).toBeNull()
    const at = (kind: string, marketId?: string) =>
      Date.parse(rows!.find((r) => r.kind === kind && (marketId === undefined || r.market_id === marketId))!.occurred_at)

    const db = serviceClient()
    const { data: resolution } = await db
      .from('markets')
      .select('market_resolutions!markets_current_resolution_id_fkey(resolved_at)')
      .eq('id', b.marketId)
      .single()
    const resolvedAt = Date.parse(
      (resolution!.market_resolutions as unknown as { resolved_at: string }).resolved_at,
    )
    expect(at('market_resolved', b.marketId)).toBe(resolvedAt)
    expect(at('bet_won', b.marketId)).toBe(resolvedAt)

    const { data: parlay } = await db.from('parlays').select('settled_at').eq('id', parlayId as string).single()
    expect(at('parlay_won')).toBe(Date.parse(parlay!.settled_at))

    const { data: completion } = await db
      .from('task_completions')
      .select('reviewed_at')
      .eq('id', completionId as string)
      .single()
    expect(at('task_completed')).toBe(Date.parse(completion!.reviewed_at))
  })
})
