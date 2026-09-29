import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, anonClient, createTestMarket, createTestTask, ensureInvited, type Member } from './fixtures'

let alice: Member
let bob: Member
let carol: Member
let dave: Member
let admin: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let carolClient: SupabaseClient
let daveClient: SupabaseClient
let adminClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  dave = await makeMember('Dave')
  admin = await makeMember('Ada')
  const { error } = await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
  if (error) throw error
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  daveClient = await clientFor(dave)
  adminClient = await clientFor(admin)
  for (const c of [aliceClient, bobClient, carolClient, daveClient, adminClient]) await ensureInvited(c)
})

const endpointFor = (m: Member, device = 'phone') => `https://fcm.googleapis.com/fcm/send/${m.displayName}-${device}`

async function subscribe(m: Member, device = 'phone'): Promise<void> {
  const { error } = await serviceClient()
    .from('push_subscriptions')
    .insert({ profile_id: m.id, endpoint: endpointFor(m, device), p256dh: `p256dh-${m.id}`, auth: `auth-${m.id}` })
  if (error) throw error
}

async function setPrefs(m: Member, prefs: Record<string, boolean>): Promise<void> {
  const { error } = await serviceClient().from('notification_prefs').upsert({ profile_id: m.id, ...prefs })
  if (error) throw error
}

async function closeNow(marketId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', marketId)
  if (error) throw error
}

async function rpcOk<T>(client: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

describe('push_subscriptions RLS', () => {
  it('lets a member read, add and delete only their own subscriptions', async () => {
    await subscribe(bob)
    const own = { endpoint: endpointFor(alice), p256dh: 'k', auth: 'a' }

    const { error: insertErr } = await aliceClient.from('push_subscriptions').insert({ profile_id: alice.id, ...own })
    expect(insertErr).toBeNull()
    const { error: forOther } = await aliceClient
      .from('push_subscriptions')
      .insert({ profile_id: bob.id, endpoint: endpointFor(bob, 'tablet'), p256dh: 'k', auth: 'a' })
    expect(forOther).not.toBeNull()

    const { data: seen } = await aliceClient.from('push_subscriptions').select('endpoint')
    expect(seen).toEqual([{ endpoint: own.endpoint }])

    await aliceClient.from('push_subscriptions').delete().eq('endpoint', endpointFor(bob))
    const { count } = await serviceClient().from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('profile_id', bob.id)
    expect(count).toBe(1)

    const { error: deleteErr } = await aliceClient.from('push_subscriptions').delete().eq('endpoint', own.endpoint)
    expect(deleteErr).toBeNull()
    const { data: after } = await aliceClient.from('push_subscriptions').select('endpoint')
    expect(after).toEqual([])
  })

  it('shows a signed-out visitor nothing', async () => {
    await subscribe(bob)
    const { data } = await anonClient().from('push_subscriptions').select('endpoint')
    expect(data ?? []).toEqual([])
  })

  it('only takes an https endpoint', async () => {
    const { error } = await aliceClient
      .from('push_subscriptions')
      .insert({ profile_id: alice.id, endpoint: 'http://example.com/push', p256dh: 'k', auth: 'a' })
    expect(error?.message).toContain('push_subscriptions_endpoint_https')
  })

  it('hands a shared device to whoever saves it with the same keys, and refuses different keys', async () => {
    const args = { p_endpoint: endpointFor(alice), p_p256dh: 'device-key', p_auth: 'device-auth' }
    await rpcOk(aliceClient, 'save_push_subscription', args)
    await rpcOk(bobClient, 'save_push_subscription', { ...args, p_user_agent: 'Bob’s browser' })

    const { data } = await serviceClient().from('push_subscriptions').select('profile_id, user_agent').eq('endpoint', args.p_endpoint)
    expect(data).toEqual([{ profile_id: bob.id, user_agent: 'Bob’s browser' }])

    const { error } = await aliceClient.rpc('save_push_subscription', { ...args, p_p256dh: 'guessed' })
    expect(error?.message).toContain('different keys')
  })

  it('keeps push_log and the recipient functions from members', async () => {
    const { data: log } = await adminClient.from('push_log').select('*')
    expect(log ?? []).toEqual([])
    for (const [fn, args] of [
      ['push_resolve_reminders', undefined],
      ['push_market_result', { p_market_id: '00000000-0000-0000-0000-000000000000' }],
      ['push_task_reviews', { p_completion_ids: [] }],
      ['push_new_market', { p_market_id: '00000000-0000-0000-0000-000000000000' }],
      ['push_wants', { p_profile_id: alice.id, p_kind: 'results' }],
    ] as const) {
      const { error } = await adminClient.rpc(fn, args)
      expect(error?.code, fn).toBe('42501')
    }
  })
})

describe('notification_prefs', () => {
  it('defaults to everything but new markets for a member who never chose', async () => {
    await subscribe(alice)
    const wants = async (kind: string) => rpcOk<boolean>(serviceClient(), 'push_wants', { p_profile_id: alice.id, p_kind: kind })
    expect(await wants('resolve_reminders')).toBe(true)
    expect(await wants('results')).toBe(true)
    expect(await wants('task_reviews')).toBe(true)
    expect(await wants('new_markets')).toBe(false)
  })

  it('fills in the same defaults on a new row', async () => {
    const { data, error } = await aliceClient
      .from('notification_prefs')
      .insert({ profile_id: alice.id })
      .select('resolve_reminders, results, task_reviews, new_markets')
      .single()
    if (error) throw error
    expect(data).toEqual({ resolve_reminders: true, results: true, task_reviews: true, new_markets: false })
  })

  it("lets a member read and change only their own row", async () => {
    await setPrefs(bob, { results: true })
    const { error: upsertErr } = await aliceClient
      .from('notification_prefs')
      .upsert({ profile_id: alice.id, new_markets: true }, { onConflict: 'profile_id' })
    expect(upsertErr).toBeNull()

    const { data: seen } = await aliceClient.from('notification_prefs').select('profile_id')
    expect(seen).toEqual([{ profile_id: alice.id }])

    await aliceClient.from('notification_prefs').update({ results: false }).eq('profile_id', bob.id)
    const { data: bobs } = await serviceClient().from('notification_prefs').select('results').eq('profile_id', bob.id).single()
    expect(bobs).toEqual({ results: true })

    const { error: forOther } = await aliceClient.from('notification_prefs').insert({ profile_id: carol.id })
    expect(forOther).not.toBeNull()
  })

  it('never notifies a member with no device, or one no longer invited', async () => {
    await subscribe(carol)
    const wants = (m: Member) => rpcOk<boolean>(serviceClient(), 'push_wants', { p_profile_id: m.id, p_kind: 'results' })
    expect(await wants(alice)).toBe(false)
    expect(await wants(carol)).toBe(true)
    await serviceClient().from('allowed_emails').delete().eq('email', carol.email)
    expect(await wants(carol)).toBe(false)
  })
})

describe('recipients', () => {
  type ResultRow = { profile_id: string; status: string; outcome_label: string | null; is_override: boolean; won: number; refunded: number; has_solo: boolean }
  const byProfile = (rows: ResultRow[]) => Object.fromEntries(rows.map((r) => [r.profile_id, r]))

  it('tells every bettor on a market its result, parlay-leg holders too, but not one who cancelled', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Will it rain?', seed: 20 })
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other leg', seed: 20 })
    await rpcOk(bobClient, 'place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 10 })
    await rpcOk(carolClient, 'place_parlay', { p_outcome_ids: [market.outcomeIds[0], other.outcomeIds[0]], p_stake: 5 })
    await rpcOk(daveClient, 'place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[1], p_amount: 10 })
    const { data: daveBet } = await serviceClient().from('bets').select('id').eq('profile_id', dave.id).single()
    await rpcOk(daveClient, 'cancel_bet', { p_bet_id: daveBet!.id })
    await rpcOk(adminClient, 'place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[1], p_amount: 10 })
    for (const m of [bob, carol, dave, admin, alice]) await subscribe(m)

    await closeNow(market.marketId)
    await rpcOk(aliceClient, 'resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_note: 'It rained' })

    const rows = byProfile(await rpcOk<ResultRow[]>(serviceClient(), 'push_market_result', { p_market_id: market.marketId }))
    expect(Object.keys(rows).sort()).toEqual([admin.id, bob.id, carol.id].sort())
    // 10 × (20 real + 40 seed) ÷ (10 + 20), rounded down.
    expect(rows[bob.id]).toMatchObject({ status: 'resolved', outcome_label: 'Yes', is_override: false, won: 20, has_solo: true })
    expect(rows[carol.id]).toMatchObject({ won: 0, has_solo: false })
    expect(rows[admin.id]).toMatchObject({ won: 0, has_solo: true })

    await rpcOk(adminClient, 'resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[1], p_note: 'Recount' })
    const overridden = byProfile(await rpcOk<ResultRow[]>(serviceClient(), 'push_market_result', { p_market_id: market.marketId }))
    expect(overridden[admin.id]).toMatchObject({ outcome_label: 'No', is_override: true, won: 20 })
    expect(overridden[bob.id]).toMatchObject({ is_override: true, won: 0 })
  })

  it('leaves out bettors who turned results off', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Will it rain?' })
    await rpcOk(bobClient, 'place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 10 })
    await rpcOk(carolClient, 'place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[1], p_amount: 10 })
    await subscribe(bob)
    await subscribe(carol)
    await setPrefs(carol, { results: false })
    await rpcOk(aliceClient, 'void_market', { p_market_id: market.marketId })

    const rows = await rpcOk<ResultRow[]>(serviceClient(), 'push_market_result', { p_market_id: market.marketId })
    expect(rows).toEqual([
      expect.objectContaining({ profile_id: bob.id, status: 'voided', outcome_label: null, is_override: false, won: 0, has_solo: true }),
    ])
  })

  it('reminds a creator once per closed market they can resolve', async () => {
    await subscribe(alice)
    await subscribe(bob)
    const due = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Due' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Still open' })
    const staked = await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Creator bet on it' })
    await rpcOk(bobClient, 'place_bet', { p_market_id: staked.marketId, p_outcome_id: staked.outcomeIds[0], p_amount: 5 })
    const resolved = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Resolved' })
    for (const m of [due, staked, resolved]) await closeNow(m.marketId)
    await rpcOk(aliceClient, 'resolve_market', { p_market_id: resolved.marketId, p_outcome_id: resolved.outcomeIds[0], p_note: 'Done' })

    expect(await rpcOk(serviceClient(), 'push_resolve_reminders')).toEqual([{ market_id: due.marketId, title: 'Due', profile_id: alice.id }])
    expect(await rpcOk(serviceClient(), 'push_resolve_reminders')).toEqual([])
  })

  it('reminds an admin creator even with a stake', async () => {
    await subscribe(admin)
    const market = await createTestMarket(adminClient, ['Yes', 'No'], { title: 'Admin bet on it' })
    await rpcOk(adminClient, 'place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 5 })
    await closeNow(market.marketId)
    expect(await rpcOk(serviceClient(), 'push_resolve_reminders')).toEqual([
      { market_id: market.marketId, title: 'Admin bet on it', profile_id: admin.id },
    ])
  })

  it("holds a reminder for a creator who has them off, and sends it once they're back on", async () => {
    await subscribe(alice)
    await setPrefs(alice, { resolve_reminders: false })
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Due' })
    await closeNow(market.marketId)

    expect(await rpcOk(serviceClient(), 'push_resolve_reminders')).toEqual([])
    await setPrefs(alice, { resolve_reminders: true })
    expect(await rpcOk(serviceClient(), 'push_resolve_reminders')).toEqual([{ market_id: market.marketId, title: 'Due', profile_id: alice.id }])
  })

  it('tells a submitter about their reviewed task, with the reason, unless they turned it off', async () => {
    const { taskId } = await createTestTask(admin, { title: 'Read Psalm 23', rewardAmount: 10 })
    const insert = async (m: Member) => {
      const { data, error } = await serviceClient()
        .from('task_completions')
        .insert({ task_id: taskId, profile_id: m.id, reward_amount: 10, period_key: 'once' })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    }
    const approved = await insert(alice)
    const rejected = await insert(bob)
    const pending = await insert(carol)
    const quiet = await insert(dave)
    for (const m of [alice, bob, carol, dave]) await subscribe(m)
    await setPrefs(dave, { task_reviews: false })
    await rpcOk(adminClient, 'approve_task_completion', { p_completion_id: approved })
    await rpcOk(adminClient, 'reject_task_completion', { p_completion_id: rejected, p_reason: 'No photo' })
    await rpcOk(adminClient, 'approve_task_completion', { p_completion_id: quiet })

    const rows = await rpcOk<{ completion_id: string }[]>(serviceClient(), 'push_task_reviews', {
      p_completion_ids: [approved, rejected, pending, quiet],
    })
    expect(rows).toEqual(
      expect.arrayContaining([
        { completion_id: approved, profile_id: alice.id, task_title: 'Read Psalm 23', status: 'approved', reward_amount: 10, review_note: null },
        { completion_id: rejected, profile_id: bob.id, task_title: 'Read Psalm 23', status: 'rejected', reward_amount: 10, review_note: 'No photo' },
      ]),
    )
    expect(rows).toHaveLength(2)
  })

  it('announces a new market only to members who opted in, never its creator', async () => {
    for (const m of [alice, bob, carol, dave]) await subscribe(m)
    await setPrefs(alice, { new_markets: true })
    await setPrefs(bob, { new_markets: true })
    await setPrefs(dave, { new_markets: false })
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Sermon past noon?' })

    expect(await rpcOk(serviceClient(), 'push_new_market', { p_market_id: market.marketId })).toEqual([
      { profile_id: bob.id, title: 'Sermon past noon?' },
    ])
  })
})
