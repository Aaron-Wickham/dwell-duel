import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { pgQuery } from './pg-query'
import { seedMembers, makeMember, clientFor, createTestMarket, createTestTask, ensureInvited, giveRole, type Member, type TestMarket } from './fixtures'
import { RATE_LIMIT_ERRORS, WRITE_LIMITS, type WriteAction } from '@/lib/forms/limits'

// Per-member write limits and the push device cap (#273, 0078).

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let market: TestMarket

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const c of [aliceClient, bobClient]) await ensureInvited(c)
  market = await createTestMarket(aliceClient, ['Yes', 'No'])
})

// Puts a member's counter for one window at `writes`, as if they'd made that many just now.
async function fill(member: Member, action: WriteAction, writes: number, windowStart = 'now()') {
  for (const { windowSeconds } of WRITE_LIMITS[action]) {
    await pgQuery(`
      insert into public.write_rate_counters (profile_id, action, window_seconds, window_start, writes)
      values ('${member.id}', '${action}', ${windowSeconds}, ${windowStart}, ${writes})
      on conflict (profile_id, action, window_seconds) do update set window_start = excluded.window_start, writes = excluded.writes
    `)
  }
}

async function counters(member: Member) {
  const { data, error } = await serviceClient()
    .from('write_rate_counters')
    .select('action, window_seconds, writes')
    .eq('profile_id', member.id)
    .order('action')
    .order('window_seconds')
  if (error) throw error
  return data
}

const comment = (client: SupabaseClient, profileId: string, body = 'Hi') =>
  client.from('market_comments').insert({ market_id: market.marketId, profile_id: profileId, body })

const createMarket = (client: SupabaseClient) =>
  client.rpc('create_market', {
    p_title: 'One more',
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 3600_000).toISOString(),
  })

describe('write_limits', () => {
  it('matches the app’s WRITE_LIMITS', async () => {
    const rows = await pgQuery<{ action: string; max_writes: number; window_seconds: number }>(
      'select * from public.write_limits() order by action, window_seconds',
    )
    const app = Object.entries(WRITE_LIMITS)
      .flatMap(([action, windows]) => windows.map((w) => ({ action, max_writes: w.max, window_seconds: w.windowSeconds })))
      .sort((a, b) => a.action.localeCompare(b.action) || a.window_seconds - b.window_seconds)
    expect(rows).toEqual(app)
  })

  it('raises exactly the messages the app words', async () => {
    const [{ src }] = await pgQuery<{ src: string }>("select prosrc as src from pg_proc where proname = 'enforce_write_limit'")
    for (const { match } of Object.values(RATE_LIMIT_ERRORS)) expect(src).toContain(match)
  })
})

describe('comments', () => {
  it('lets a member post 10 a minute, refuses the 11th, and keeps it out of the table', async () => {
    for (let i = 0; i < 10; i++) expect((await comment(aliceClient, alice.id, `c${i}`)).error).toBeNull()
    const { error } = await comment(aliceClient, alice.id, 'one too many')
    expect(error?.code).toBe('DD429')
    expect(error?.message).toBe(RATE_LIMIT_ERRORS.comment.match)

    const { count } = await serviceClient().from('market_comments').select('id', { count: 'exact', head: true }).eq('profile_id', alice.id)
    expect(count).toBe(10)
    // The refused write rolled its own increment back.
    expect(await counters(alice)).toEqual([
      { action: 'comment', window_seconds: 60, writes: 10 },
      { action: 'comment', window_seconds: 86400, writes: 10 },
    ])
  })

  it('counts each member on their own', async () => {
    await fill(alice, 'comment', 10)
    expect((await comment(aliceClient, alice.id)).error?.code).toBe('DD429')
    expect((await comment(bobClient, bob.id)).error).toBeNull()
  })

  it('starts a new window once the old one has passed', async () => {
    await pgQuery(`
      insert into public.write_rate_counters (profile_id, action, window_seconds, window_start, writes) values
        ('${alice.id}', 'comment', 60, now() - interval '61 seconds', 10),
        ('${alice.id}', 'comment', 86400, now(), 10)
    `)
    expect((await comment(aliceClient, alice.id)).error).toBeNull()
    expect(await counters(alice)).toEqual([
      { action: 'comment', window_seconds: 60, writes: 1 },
      { action: 'comment', window_seconds: 86400, writes: 11 },
    ])
  })

  it('holds to the daily cap even when the minute is fresh', async () => {
    await pgQuery(`
      insert into public.write_rate_counters (profile_id, action, window_seconds, window_start, writes) values
        ('${alice.id}', 'comment', 60, now(), 0),
        ('${alice.id}', 'comment', 86400, now(), 200)
    `)
    expect((await comment(aliceClient, alice.id)).error?.message).toBe(RATE_LIMIT_ERRORS.comment.match)
  })

  it('never counts the service role', async () => {
    await fill(alice, 'comment', 10)
    expect((await comment(serviceClient(), alice.id)).error).toBeNull()
  })

  it('leaves admins and the owner unlimited', async () => {
    const ada = await makeMember('Ada')
    await giveRole(ada, 'admin')
    const adaClient = await clientFor(ada)
    await fill(ada, 'comment', 10)
    expect((await comment(adaClient, ada.id)).error).toBeNull()
  })
})

describe('markets', () => {
  it('refuses a member’s 21st market in a day', async () => {
    await fill(alice, 'market', 19)
    expect((await createMarket(aliceClient)).error).toBeNull()
    const { error } = await createMarket(aliceClient)
    expect(error?.message).toBe(RATE_LIMIT_ERRORS.market.match)
  })
})

describe('reactions', () => {
  it('refuses a reaction past the minute’s 60', async () => {
    await fill(alice, 'reaction', 60)
    const { error } = await aliceClient
      .from('feed_reactions')
      .insert({ event_id: `market:${market.marketId}`, profile_id: alice.id, kind: 'fire' })
    expect(error?.message).toBe(RATE_LIMIT_ERRORS.reaction.match)
  })

  it('still lets a member take one back', async () => {
    const eventId = `market:${market.marketId}`
    expect((await aliceClient.from('feed_reactions').insert({ event_id: eventId, profile_id: alice.id, kind: 'fire' })).error).toBeNull()
    await fill(alice, 'reaction', 60)
    expect((await aliceClient.from('feed_reactions').delete().match({ event_id: eventId, profile_id: alice.id, kind: 'fire' })).error).toBeNull()
  })
})

describe('task submissions', () => {
  it('refuses a submission past the day’s 30', async () => {
    const { taskId } = await createTestTask(alice)
    await fill(bob, 'task_submission', 30)
    const { error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error?.message).toBe(RATE_LIMIT_ERRORS.task_submission.match)
  })
})

describe('bet cancels', () => {
  async function placeBet(client: SupabaseClient, profileId: string): Promise<number> {
    const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 5 })
    if (error) throw error
    const { data, error: readErr } = await serviceClient()
      .from('bets')
      .select('id')
      .eq('profile_id', profileId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    if (readErr) throw readErr
    return data.id
  }

  it('refuses a cancel past the hour’s 20, leaving the bet and the balance alone', async () => {
    const betId = await placeBet(bobClient, bob.id)
    await fill(bob, 'bet_cancel', 20)
    const before = (await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()).data!.balance
    const { error } = await bobClient.rpc('cancel_bet', { p_bet_id: betId })
    expect(error?.message).toBe(RATE_LIMIT_ERRORS.bet_cancel.match)
    expect((await serviceClient().from('bets').select('id').eq('id', betId)).data).toHaveLength(1)
    expect((await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()).data!.balance).toBe(before)
  })

  it('doesn’t count the owner removing someone else’s bet against its bettor', async () => {
    const olive = await makeMember('Olive')
    await giveRole(olive, 'owner')
    const oliveClient = await clientFor(olive)
    const betId = await placeBet(bobClient, bob.id)
    await fill(bob, 'bet_cancel', 20)
    const { error } = await oliveClient.rpc('remove_bet', { p_bet_id: betId })
    expect(error).toBeNull()
  })
})

describe('write_rate_counters', () => {
  it('is out of members’ reach', async () => {
    await fill(alice, 'comment', 3)
    expect((await aliceClient.from('write_rate_counters').select('*')).error?.code).toBe('42501')
    const { error } = await aliceClient.from('write_rate_counters').delete().eq('profile_id', alice.id)
    expect(error?.code).toBe('42501')
  })
})

describe('push devices', () => {
  const endpoint = (i: number) => `https://fcm.googleapis.com/fcm/send/alice-${i}`

  it('keeps a member’s ten most recent subscriptions, dropping the oldest', async () => {
    for (let i = 0; i < 11; i++) {
      const { error } = await aliceClient.rpc('save_push_subscription', { p_endpoint: endpoint(i), p_p256dh: `k${i}`, p_auth: `a${i}` })
      expect(error).toBeNull()
    }
    const { data } = await serviceClient().from('push_subscriptions').select('endpoint').eq('profile_id', alice.id)
    const kept = data!.map((r) => r.endpoint).sort()
    expect(kept).toHaveLength(10)
    expect(kept).not.toContain(endpoint(0))
    expect(kept).toContain(endpoint(10))
  })

  it('keeps a recently used device over a newer idle one', async () => {
    for (let i = 0; i < 10; i++) {
      await aliceClient.rpc('save_push_subscription', { p_endpoint: endpoint(i), p_p256dh: `k${i}`, p_auth: `a${i}` })
    }
    await serviceClient().from('push_subscriptions').update({ last_success_at: new Date(Date.now() + 60_000).toISOString() }).eq('endpoint', endpoint(0))
    await aliceClient.rpc('save_push_subscription', { p_endpoint: endpoint(10), p_p256dh: 'k10', p_auth: 'a10' })
    const { data } = await serviceClient().from('push_subscriptions').select('endpoint').eq('profile_id', alice.id)
    const kept = data!.map((r) => r.endpoint)
    expect(kept).toHaveLength(10)
    expect(kept).toContain(endpoint(0))
    expect(kept).not.toContain(endpoint(1))
  })

  it('leaves other members’ devices alone', async () => {
    const { error } = await bobClient.rpc('save_push_subscription', { p_endpoint: 'https://fcm.googleapis.com/fcm/send/bob', p_p256dh: 'kb', p_auth: 'ab' })
    expect(error).toBeNull()
    for (let i = 0; i < 11; i++) {
      await aliceClient.rpc('save_push_subscription', { p_endpoint: endpoint(i), p_p256dh: `k${i}`, p_auth: `a${i}` })
    }
    const { data } = await serviceClient().from('push_subscriptions').select('endpoint').eq('profile_id', bob.id)
    expect(data).toHaveLength(1)
  })
})
