import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { pgQuery } from './pg-query'
import { anonClient, clientFor, createTestMarket, ensureInvited, giveRole, seedMembers, type Member } from './fixtures'
import { LIVE_PING_INTERVAL_MS, LIVE_TOPICS } from '@/components/live/live-refresh'

async function resetThrottle(): Promise<void> {
  await pgQuery("update public.live_pings set sent_at = '-infinity'")
}

async function messagesSince(topic: string, since: string): Promise<number> {
  const [row] = await pgQuery<{ n: number }>(
    `select count(*)::int as n from realtime.messages where topic = 'live:${topic}' and inserted_at >= '${since}'`,
  )
  return row.n
}

async function dbNow(): Promise<string> {
  const [row] = await pgQuery<{ now: string }>('select now()::text as now')
  return row.now
}

const open: { client: SupabaseClient; channel: RealtimeChannel }[] = []

// Resolves with the channel's first settled status: SUBSCRIBED, or the error a refused join gives.
async function join(client: SupabaseClient, topic: string, onPing?: () => void): Promise<string> {
  await client.realtime.setAuth()
  const channel = client.channel(`live:${topic}`, { config: { private: true } })
  if (onPing) channel.on('broadcast', { event: 'changed' }, onPing)
  open.push({ client, channel })
  return new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(status)
    })
  })
}

let alice: Member
let bob: Member

beforeAll(async () => {
  ;[alice, bob] = await seedMembers()
})

afterEach(async () => {
  for (const { client, channel } of open.splice(0)) await client.removeChannel(channel)
})

describe('live pings (0085)', () => {
  it('keeps the interval and the topic list equal to the client mirrors', async () => {
    const [interval] = await pgQuery<{ ms: number }>('select public.live_ping_interval_ms() as ms')
    expect(interval.ms).toBe(LIVE_PING_INTERVAL_MS)
    const topics = await pgQuery<{ topic: string }>('select topic from public.live_pings order by topic')
    expect(topics.map((row) => row.topic)).toEqual([...LIVE_TOPICS].sort())
  })

  it('pings a topic once per transaction, however many rows it writes', async () => {
    await resetThrottle()
    const since = await dbNow()
    await pgQuery(
      "select public.send_live_ping('activity'); select public.send_live_ping('activity'); select public.send_live_ping('activity')",
    )
    expect(await messagesSince('activity', since)).toBe(1)
  })

  it('holds back a second ping inside the interval, and sends one once it has passed', async () => {
    await resetThrottle()
    const since = await dbNow()
    await pgQuery("select public.send_live_ping('tasks')")
    await pgQuery("select public.send_live_ping('tasks')")
    expect(await messagesSince('tasks', since)).toBe(1)

    await pgQuery(
      `update public.live_pings set sent_at = now() - interval '${LIVE_PING_INTERVAL_MS + 1} milliseconds' where topic = 'tasks'`,
    )
    await pgQuery("select public.send_live_ping('tasks')")
    expect(await messagesSince('tasks', since)).toBe(2)
  })

  it('sends nothing for a transaction that rolls back', async () => {
    await resetThrottle()
    const since = await dbNow()
    await expect(pgQuery("select public.send_live_ping('reactions'); select 1 / 0")).rejects.toThrow()
    expect(await messagesSince('reactions', since)).toBe(0)
  })

  it('pings markets and pools from one create_market call, once each', async () => {
    await resetThrottle()
    const since = await dbNow()
    await createTestMarket(await clientFor(alice), ['Yes', 'No'])
    // createTestMarket's service-role seed update is its own transaction, and the throttle holds it.
    expect(await messagesSince('markets', since)).toBe(1)
    expect(await messagesSince('pools', since)).toBe(1)
  })

  it("won't let members call the ping function themselves", async () => {
    const client = await clientFor(alice)
    const { error } = await client.rpc('send_live_ping', { p_topic: 'markets' })
    expect(error).not.toBeNull()
  })

  it('lets an invited member join the group topics and hear a ping, but not the review queue', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    let pinged = false
    expect(await join(client, 'markets', () => (pinged = true))).toBe('SUBSCRIBED')
    expect(await join(client, 'reviews')).toBe('CHANNEL_ERROR')

    await resetThrottle()
    await pgQuery("select public.send_live_ping('markets')")
    await expect.poll(() => pinged, { timeout: 5_000 }).toBe(true)
  })

  it('lets a reviewer join the review queue', async () => {
    await giveRole(bob, 'reviewer')
    expect(await join(await clientFor(bob), 'reviews')).toBe('SUBSCRIBED')
  })

  it('refuses a signed-out client', async () => {
    expect(await join(anonClient(), 'markets')).toBe('CHANNEL_ERROR')
  })
})
