import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { pgQuery } from './pg-query'
import { anonClient, clientFor, createTestMarket, ensureInvited, giveRole, makeMember, seedMembers, type Member } from './fixtures'
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

  // The triggers are deferred, so the throttle looks at the commit, not at the first row written:
  // a change the client's refresh after the earlier ping would come too soon to read still pings.
  it('pings a change written inside the window but committed after it', async () => {
    const { marketId } = await createTestMarket(await clientFor(alice), ['Yes', 'No'])
    await pgQuery(
      `update public.live_pings set sent_at = clock_timestamp() - interval '${LIVE_PING_INTERVAL_MS - 1000} milliseconds' where topic = 'markets'`,
    )
    const since = await dbNow()
    await pgQuery(`update public.markets set title = title where id = '${marketId}'; select pg_sleep(1.5)`)
    expect(await messagesSince('markets', since)).toBe(1)
  })

  it('holds back a change committed inside the window', async () => {
    const { marketId } = await createTestMarket(await clientFor(alice), ['Yes', 'No'])
    await pgQuery("update public.live_pings set sent_at = clock_timestamp() where topic = 'markets'")
    const since = await dbNow()
    await pgQuery(`update public.markets set title = title where id = '${marketId}'`)
    expect(await messagesSince('markets', since)).toBe(0)
  })

  // Only a committed ping may hold a change back: the transaction holding the row could still roll back.
  it('sends its own ping while another transaction holds the topic row', async () => {
    await resetThrottle()
    const since = await dbNow()
    const holder = pgQuery(
      "update public.live_pings set sent_at = clock_timestamp() where topic = 'reactions'; select pg_sleep(2)",
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    await pgQuery("select public.send_live_ping('reactions')")
    await holder
    expect(await messagesSince('reactions', since)).toBe(1)
  })

  // The deferred part lives on live_ping_queue, so a live table has no pending trigger events and a
  // migration can write one and then alter it in the same transaction (55006 otherwise).
  it('lets a transaction write a live table and then alter it, and still pings at commit', async () => {
    await resetThrottle()
    const since = await dbNow()
    await pgQuery(`
      insert into public.tasks (title, reward_amount, created_by) values ('Alter after write', 5, '${alice.id}');
      alter table public.tasks drop constraint tasks_title_length;
      alter table public.tasks add constraint tasks_title_length check (char_length(title) <= 120) not valid;
    `)
    expect(await messagesSince('tasks', since)).toBe(1)
    const [queue] = await pgQuery<{ n: number }>('select count(*)::int as n from public.live_ping_queue')
    expect(queue.n).toBe(0)
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

  it('refuses a signed-in user who was never invited', async () => {
    const stranger = await makeMember('Carol')
    expect(await join(await clientFor(stranger), 'markets')).toBe('CHANNEL_ERROR')
  })

  it('refuses a signed-out client', async () => {
    expect(await join(anonClient(), 'markets')).toBe('CHANNEL_ERROR')
  })
})
