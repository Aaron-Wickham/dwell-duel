import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { pgQuery } from './pg-query'
import { seedMembers, makeMember, clientFor, anonClient, createTestMarket, createTestTask, ensureInvited, type Member, giveRole } from './fixtures'
import { isPushEndpoint, PUSH_HOSTS } from '@/lib/push/subscription'

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
  await giveRole(admin, 'admin')
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
  it('lets a member read and delete only their own subscriptions, saved through the RPC', async () => {
    await subscribe(bob)
    const own = { endpoint: endpointFor(alice), p256dh: 'k', auth: 'a' }

    await rpcOk(aliceClient, 'save_push_subscription', { p_endpoint: own.endpoint, p_p256dh: own.p256dh, p_auth: own.auth })

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

  it('refuses a direct INSERT: save_push_subscription is the only writer (#201)', async () => {
    const { error } = await aliceClient
      .from('push_subscriptions')
      .insert({ profile_id: alice.id, endpoint: endpointFor(alice), p256dh: 'k', auth: 'a' })
    expect(error?.code).toBe('42501')
    const { count } = await serviceClient().from('push_subscriptions').select('id', { count: 'exact', head: true })
    expect(count).toBe(0)
  })

  it('only takes an https endpoint', async () => {
    const { error } = await aliceClient.rpc('save_push_subscription', { p_endpoint: 'http://example.com/push', p_p256dh: 'k', p_auth: 'a' })
    expect(error?.message).toContain('push_subscriptions_endpoint_https')
  })

  describe('push-service endpoints only (#201)', () => {
    const ACCEPTED = [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://android.googleapis.com/gcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-bl2p.notify.windows.com/w/?token=abc',
      'https://FCM.googleapis.com:443/fcm/send/abc',
    ]
    const REFUSED = [
      'https://evil.example.com/collect',
      'https://fcm.googleapis.com.evil.example.com/collect',
      'https://evil.example.com/fcm.googleapis.com/send',
      'https://fcm.googleapis.com@evil.example.com/collect',
      'https://evil.example.com\\@fcm.googleapis.com/collect',
      'https://evil.example.com?x=fcm.googleapis.com',
      'https://evil.example.com#fcm.googleapis.com',
      'https://notfcm.googleapis.com/send',
      'https://fcm.googleapis.com./send',
    ]

    it('accepts an FCM, Apple, Mozilla or WNS endpoint through the RPC', async () => {
      for (const endpoint of ACCEPTED) {
        const { error } = await aliceClient.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: 'k', p_auth: 'a' })
        expect(error, endpoint).toBeNull()
      }
    })

    it('refuses any other host through the RPC and a direct service-role insert alike', async () => {
      for (const endpoint of REFUSED) {
        const { error } = await aliceClient.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: 'k', p_auth: 'a' })
        expect(error?.message, endpoint).toContain('push_subscriptions_endpoint_push_service')
        const { error: direct } = await serviceClient()
          .from('push_subscriptions')
          .insert({ profile_id: alice.id, endpoint, p256dh: 'k', auth: 'a' })
        expect(direct?.message, endpoint).toContain('push_subscriptions_endpoint_push_service')
      }
      const { count } = await serviceClient().from('push_subscriptions').select('id', { count: 'exact', head: true })
      expect(count).toBe(0)
    })

    it('agrees with the app’s isPushEndpoint on every one of them, and names the same hosts', async () => {
      const urls = [...ACCEPTED, ...REFUSED]
      const rows = await pgQuery<{ endpoint: string; ok: boolean }>(
        `select u as endpoint, public.is_push_endpoint(u) as ok from unnest(array[${urls.map((u) => `'${u}'`).join(', ')}]) as u`,
      )
      expect(rows.map((r) => [r.endpoint, r.ok])).toEqual(urls.map((u) => [u, isPushEndpoint(u)]))

      const [{ hosts }] = await pgQuery<{ hosts: string[] }>('select public.push_hosts() as hosts')
      expect(hosts).toEqual(PUSH_HOSTS)
    })
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
      ['due_resolve_reminders', undefined],
      ['due_market_alerts', undefined],
      ['claim_push_log', { p_kind: 'market_alert', p_refs: [] }],
      ['push_market_result', { p_market_id: '00000000-0000-0000-0000-000000000000' }],
      ['push_task_reviews', { p_completion_ids: [] }],
      ['push_task_alerts', { p_completion_id: '00000000-0000-0000-0000-000000000000' }],
      ['push_market_alerts', undefined],
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
    expect(await wants('review_alerts')).toBe(true)
  })

  it('fills in the same defaults on a new row', async () => {
    const { data, error } = await aliceClient
      .from('notification_prefs')
      .insert({ profile_id: alice.id })
      .select('resolve_reminders, results, task_reviews, new_markets, review_alerts')
      .single()
    if (error) throw error
    expect(data).toEqual({ resolve_reminders: true, results: true, task_reviews: true, new_markets: false, review_alerts: true })
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

async function setRole(m: Member, role: 'reviewer' | 'admin' | 'owner'): Promise<void> {
  await giveRole(m, role)
}

// A reviewer on the invite list, as a real one always is: push_wants skips anyone who isn't.
async function makeReviewer(name: string): Promise<{ member: Member; client: SupabaseClient }> {
  const member = await makeMember(name)
  await setRole(member, 'reviewer')
  const client = await clientFor(member)
  await ensureInvited(client)
  return { member, client }
}

async function submitTask(m: Member, taskId: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from('task_completions')
    .insert({ task_id: taskId, profile_id: m.id, reward_amount: 10, period_key: 'once' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// #207: the read no longer claims; the route claims a market once a device has taken its push.
describe('due reads and claims (0071)', () => {
  it('lists a due reminder as often as it is asked, until the market is claimed', async () => {
    await subscribe(alice)
    const due = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Due' })
    await closeNow(due.marketId)
    const row = { market_id: due.marketId, title: 'Due', profile_id: alice.id }

    expect(await rpcOk(serviceClient(), 'due_resolve_reminders')).toEqual([row])
    expect(await rpcOk(serviceClient(), 'due_resolve_reminders')).toEqual([row])
    expect(await rpcOk(serviceClient(), 'claim_push_log', { p_kind: 'resolve_reminder', p_refs: [due.marketId] })).toBe(1)
    expect(await rpcOk(serviceClient(), 'due_resolve_reminders')).toEqual([])
    // Claiming again is a no-op, as a second caller racing the first would find.
    expect(await rpcOk(serviceClient(), 'claim_push_log', { p_kind: 'resolve_reminder', p_refs: [due.marketId] })).toBe(0)
  })

  it('picks the same reminder recipients push_resolve_reminders did, and the same alert recipients push_market_alerts did', async () => {
    const { member: reviewer } = await makeReviewer('Rae')
    for (const m of [alice, bob, reviewer, admin]) await subscribe(m)
    const due = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Due' })
    const staked = await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Creator bet on it' })
    await rpcOk(bobClient, 'place_bet', { p_market_id: staked.marketId, p_outcome_id: staked.outcomeIds[0], p_amount: 5 })
    const own = await createTestMarket(adminClient, ['Yes', 'No'], { title: 'Admin made it' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Still open' })
    for (const m of [due, staked, own]) await closeNow(m.marketId)

    expect(await rpcOk(serviceClient(), 'due_resolve_reminders')).toEqual(
      [
        { market_id: due.marketId, title: 'Due', profile_id: alice.id },
        { market_id: own.marketId, title: 'Admin made it', profile_id: admin.id },
      ].sort((a, b) => a.market_id.localeCompare(b.market_id)),
    )
    expect(await rpcOk(serviceClient(), 'due_market_alerts')).toEqual(
      [
        { market_id: due.marketId, title: 'Due', profile_id: admin.id },
        { market_id: staked.marketId, title: 'Creator bet on it', profile_id: admin.id },
      ].sort((a, b) => a.market_id.localeCompare(b.market_id)),
    )

    expect(await rpcOk(serviceClient(), 'claim_push_log', { p_kind: 'market_alert', p_refs: [due.marketId, staked.marketId] })).toBe(2)
    expect(await rpcOk(serviceClient(), 'due_market_alerts')).toEqual([])
    // A claim of one kind leaves the other kind due.
    expect(await rpcOk<unknown[]>(serviceClient(), 'due_resolve_reminders')).toHaveLength(2)
  })

  it('only takes the two kinds push_log allows', async () => {
    const { error } = await serviceClient().rpc('claim_push_log', { p_kind: 'party', p_refs: ['x'] })
    expect(error?.message).toContain('push_log_kind_check')
  })
})

describe('review alerts (0058)', () => {
  it('tells reviewers and above about a submission, never the submitter or a plain member', async () => {
    const { member: reviewer } = await makeReviewer('Rae')
    const { taskId } = await createTestTask(admin, { title: 'Read Psalm 23' })
    const completion = await submitTask(alice, taskId)
    for (const m of [alice, bob, reviewer, admin]) await subscribe(m)

    const rows = await rpcOk<{ profile_id: string; task_title: string; submitter_name: string }[]>(serviceClient(), 'push_task_alerts', {
      p_completion_id: completion,
    })
    expect(rows.map((r) => r.profile_id).sort()).toEqual([reviewer.id, admin.id].sort())
    expect(rows[0]).toMatchObject({ task_title: 'Read Psalm 23', submitter_name: alice.displayName })
  })

  it('leaves out a submitter who is themselves a reviewer, and a reviewer who turned alerts off', async () => {
    const { member: reviewer } = await makeReviewer('Rae')
    await setRole(alice, 'reviewer')
    const { taskId } = await createTestTask(admin)
    const completion = await submitTask(alice, taskId)
    for (const m of [alice, reviewer, admin]) await subscribe(m)
    await setPrefs(reviewer, { review_alerts: false })

    const rows = await rpcOk<{ profile_id: string }[]>(serviceClient(), 'push_task_alerts', { p_completion_id: completion })
    expect(rows.map((r) => r.profile_id)).toEqual([admin.id])
  })

  it('sends nothing for a submission that has already been reviewed', async () => {
    const { taskId } = await createTestTask(admin)
    const completion = await submitTask(alice, taskId)
    await subscribe(admin)
    await rpcOk(adminClient, 'approve_task_completion', { p_completion_id: completion })
    expect(await rpcOk(serviceClient(), 'push_task_alerts', { p_completion_id: completion })).toEqual([])
  })

  it('alerts admins, not reviewers or the creator, once per closed market', async () => {
    const { member: reviewer } = await makeReviewer('Rae')
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Sermon past noon?' })
    await closeNow(market.marketId)
    for (const m of [alice, reviewer, admin]) await subscribe(m)

    const rows = await rpcOk<{ market_id: string; title: string; profile_id: string }[]>(serviceClient(), 'push_market_alerts')
    expect(rows).toEqual([{ market_id: market.marketId, title: 'Sermon past noon?', profile_id: admin.id }])
    expect(await rpcOk(serviceClient(), 'push_market_alerts')).toEqual([])
  })

  it('does not alert for a market that is still open, and tells the admin who made it only through the reminder', async () => {
    const open = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Still open' })
    const own = await createTestMarket(adminClient, ['Yes', 'No'], { title: 'Admin made it' })
    await closeNow(own.marketId)
    await subscribe(admin)

    expect(open.marketId).not.toBe(own.marketId)
    expect(await rpcOk(serviceClient(), 'push_market_alerts')).toEqual([])
  })

  it('holds a market alert until an admin has notifications on', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Due' })
    await closeNow(market.marketId)
    expect(await rpcOk(serviceClient(), 'push_market_alerts')).toEqual([])
    await subscribe(admin)
    expect(await rpcOk<unknown[]>(serviceClient(), 'push_market_alerts')).toHaveLength(1)
  })

  it('counts what is waiting on the caller by role', async () => {
    const { client: reviewerClient } = await makeReviewer('Rae')
    const { taskId } = await createTestTask(admin)
    await submitTask(alice, taskId)
    await submitTask(admin, (await createTestTask(admin, { title: 'Another' })).taskId)
    const closed = await createTestMarket(aliceClient, ['Yes', 'No'])
    await closeNow(closed.marketId)
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Not closed yet' })

    const counts = async (c: SupabaseClient) => (await rpcOk<{ tasks: number; markets: number }[]>(c, 'my_review_counts'))[0]
    expect(await counts(aliceClient)).toEqual({ tasks: 0, markets: 0 })
    expect(await counts(reviewerClient)).toEqual({ tasks: 2, markets: 0 })
    // The admin's own submission never counts for them.
    expect(await counts(adminClient)).toEqual({ tasks: 1, markets: 1 })
  })
})

describe('record_push_results pruning (#257)', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
  const HOUR = 3_600_000
  const DAY = 24 * HOUR

  async function row(m: Member, device: string) {
    const { data, error } = await serviceClient()
      .from('push_subscriptions')
      .select('id, failure_count, first_failed_at, last_success_at')
      .eq('endpoint', endpointFor(m, device))
      .maybeSingle()
    if (error) throw error
    return data
  }
  const record = (delivered: string[], failed: string[]) =>
    rpcOk<number>(serviceClient(), 'record_push_results', { p_delivered: delivered, p_failed: failed })

  it('counts failures, resets on delivery, and is callable by the service role only', async () => {
    await subscribe(alice)
    const id = (await row(alice, 'phone'))!.id

    await record([], [id])
    await record([], [id])
    expect(await row(alice, 'phone')).toMatchObject({ failure_count: 2 })
    expect((await row(alice, 'phone'))!.first_failed_at).not.toBeNull()

    await record([id], [])
    expect(await row(alice, 'phone')).toMatchObject({ failure_count: 0, first_failed_at: null })
    expect((await row(alice, 'phone'))!.last_success_at).not.toBeNull()

    const { error } = await aliceClient.rpc('record_push_results', { p_delivered: [], p_failed: [id] })
    expect(error).not.toBeNull()
  })

  it('keeps a device that failed a few times, or only recently, and prunes one that kept failing for over a day', async () => {
    await subscribe(alice, 'recent')
    await subscribe(alice, 'few')
    await subscribe(alice, 'dead')
    const [recent, few, dead] = await Promise.all(['recent', 'few', 'dead'].map(async (d) => (await row(alice, d))!.id))
    const set = (id: string, failure_count: number, first_failed_at: string) =>
      serviceClient().from('push_subscriptions').update({ failure_count, first_failed_at }).eq('id', id)
    await set(recent, 9, ago(HOUR)) // many failures, but inside an outage window
    await set(few, 2, ago(3 * DAY)) // long ago, but only a couple of failures
    await set(dead, 5, ago(2 * DAY))

    expect(await record([], [])).toBe(1)
    expect(await row(alice, 'recent')).not.toBeNull()
    expect(await row(alice, 'few')).not.toBeNull()
    expect(await row(alice, 'dead')).toBeNull()
  })

  it('prunes a failing device with no delivery for 60 days, never a healthy one', async () => {
    await subscribe(alice, 'stale')
    await subscribe(alice, 'healthy')
    const stale = (await row(alice, 'stale'))!.id
    const healthy = (await row(alice, 'healthy'))!.id
    await serviceClient().from('push_subscriptions').update({ last_success_at: ago(61 * DAY), failure_count: 1, first_failed_at: ago(2 * DAY) }).eq('id', stale)
    await serviceClient().from('push_subscriptions').update({ last_success_at: ago(61 * DAY) }).eq('id', healthy)

    expect(await record([], [])).toBe(1)
    expect(await row(alice, 'stale')).toBeNull()
    expect(await row(alice, 'healthy')).not.toBeNull()
  })

  it('starts a clean streak when a device saves its subscription again', async () => {
    const args = { p_endpoint: endpointFor(alice), p_p256dh: 'k', p_auth: 'a' }
    await rpcOk(aliceClient, 'save_push_subscription', args)
    const id = (await row(alice, 'phone'))!.id
    await record([], [id])
    await rpcOk(aliceClient, 'save_push_subscription', args)
    expect(await row(alice, 'phone')).toMatchObject({ failure_count: 0, first_failed_at: null })
  })

  it('keeps a quiet healthy device on one transient failure, even after 60 days without a delivery', async () => {
    await subscribe(alice, 'quiet')
    const id = (await row(alice, 'quiet'))!.id
    await serviceClient().from('push_subscriptions').update({ last_success_at: ago(90 * DAY) }).eq('id', id)
    await record([], [id])
    expect(await row(alice, 'quiet')).toMatchObject({ failure_count: 1 })
  })

  it('prunes nothing for a batch that delivered nothing and failed on several devices', async () => {
    await subscribe(alice, 'a')
    await subscribe(alice, 'b')
    await subscribe(alice, 'c')
    const ids = await Promise.all(['a', 'b', 'c'].map(async (d) => (await row(alice, d))!.id))
    await serviceClient().from('push_subscriptions').update({ failure_count: 9, first_failed_at: ago(3 * DAY) }).in('id', ids)
    expect(await record([], ids)).toBe(0)
    for (const d of ['a', 'b', 'c']) expect(await row(alice, d)).not.toBeNull()
    // The same devices are pruned once a batch does deliver somewhere.
    await subscribe(bob)
    expect(await record([(await row(bob, 'phone'))!.id], [])).toBe(3)
  })
})

describe('closing-alerts lease and give-up (#257)', () => {
  it('hands the lease to one caller at a time, until it is released or expires', async () => {
    const db = serviceClient()
    const claim = async (s = 120) => (await rpcOk<boolean>(db, 'claim_cron_lease', { p_name: 'closing-alerts', p_seconds: s }))
    await rpcOk(db, 'release_cron_lease', { p_name: 'closing-alerts' })
    expect(await claim()).toBe(true)
    expect(await claim()).toBe(false)
    await rpcOk(db, 'release_cron_lease', { p_name: 'closing-alerts' })
    expect(await claim(1)).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(await claim()).toBe(true)
    const { error } = await aliceClient.rpc('claim_cron_lease', { p_name: 'closing-alerts', p_seconds: 1 })
    expect(error).not.toBeNull()
    await rpcOk(db, 'release_cron_lease', { p_name: 'closing-alerts' })
  })

  it('gives up on a market whose pushes have failed for over 24 hours, and stops offering it', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await closeNow(market.marketId)
    const db = serviceClient()
    const due = async () => (await rpcOk<{ market_id: string }[]>(db, 'due_market_alerts')).filter((r) => r.market_id === market.marketId)
    await rpcOk(adminClient, 'save_push_subscription', { p_endpoint: endpointFor(admin), p_p256dh: 'k', p_auth: 'a' })
    expect(await due()).not.toHaveLength(0)

    expect(await rpcOk<number>(db, 'record_push_failures', { p_kind: 'market_alert', p_refs: [market.marketId] })).toBe(0)
    expect(await due()).not.toHaveLength(0)
    await db.from('push_attempts').update({ first_tried_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq('ref', market.marketId)
    expect(await rpcOk<number>(db, 'record_push_failures', { p_kind: 'market_alert', p_refs: [market.marketId] })).toBe(1)
    expect(await due()).toHaveLength(0)
  })
})
