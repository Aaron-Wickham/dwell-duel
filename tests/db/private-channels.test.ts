import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { anonClient, clientFor, ensureInvited, makeMember, seedMembers, type Member } from './fixtures'
import { memberTopic } from '@/components/live/live-refresh'

const open: { client: SupabaseClient; channel: RealtimeChannel }[] = []

// Resolves with the channel's first settled status: SUBSCRIBED, UNAUTHORIZED for a join the
// topic's policy refuses, or another error (a Postgres Changes subscription the server refuses
// after the join arrives as a system error).
async function join(client: SupabaseClient, topic: string, profileId: string, onChange?: () => void): Promise<string> {
  await client.realtime.setAuth()
  const channel = client.channel(topic, { config: { private: true } })
  const filter = `id=eq.${profileId}`
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter }, () => onChange?.())
  open.push({ client, channel })
  return new Promise((resolve) => {
    channel.on('system', {}, (payload: { status?: string }) => {
      if (payload?.status === 'error') resolve('CHANNEL_ERROR')
    })
    channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' && err?.message.startsWith('Unauthorized')) resolve('UNAUTHORIZED')
      else if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(status)
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

describe('private member channels (0100)', () => {
  // The policy only grants Broadcast reads: Realtime checks a private join against Broadcast and
  // Presence alone, so that is enough for a channel carrying only Postgres Changes, whose rows
  // the tables' own RLS still filters.
  it("lets an invited member join their own base and page topics, and hear their profile's changes there", async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    let changed = false
    expect(await join(client, memberTopic(alice.id, 'base', 1), alice.id, () => (changed = true))).toBe('SUBSCRIBED')
    expect(await join(client, memberTopic(alice.id, 'page', 2), alice.id)).toBe('SUBSCRIBED')

    // The join settles before Postgres Changes is listening, and a change before then is never
    // replayed, so the row is touched again on each poll until one lands.
    await expect
      .poll(
        async () => {
          const { error } = await serviceClient().from('profiles').update({ display_name: 'Alice' }).eq('id', alice.id)
          if (error) throw error
          return changed
        },
        { timeout: 10_000, interval: 500 },
      )
      .toBe(true)
  })

  it("won't let a member join another member's topic", async () => {
    const client = await clientFor(bob)
    await ensureInvited(client)
    expect(await join(client, memberTopic(alice.id, 'base', 1), alice.id)).toBe('UNAUTHORIZED')
    expect(await join(client, memberTopic(alice.id, 'page', 1), bob.id)).toBe('UNAUTHORIZED')
  }, 30_000)

  // A fresh client per topic: Realtime answers a refused join only after about five seconds, and a
  // socket's third refusal in a row comes too late for the join's own timeout.
  it.each([`live-member:<me>`, `live-member:<me>:other:1`, `live-member:<me>:base:1x`, 'anything'])(
    'refuses a topic shaped any other way: %s',
    async (shape) => {
      const client = await clientFor(alice)
      await ensureInvited(client)
      const topic = shape.replace('<me>', alice.id)
      expect(await join(client, topic, alice.id)).toBe('UNAUTHORIZED')
    },
  )

  it('refuses a signed-in user who was never invited', async () => {
    const stranger = await makeMember('Carol')
    expect(await join(await clientFor(stranger), memberTopic(stranger.id, 'base', 1), stranger.id)).toBe('UNAUTHORIZED')
  })

  it('refuses a signed-out client', async () => {
    expect(await join(anonClient(), memberTopic(alice.id, 'base', 1), alice.id)).toBe('UNAUTHORIZED')
  })
})
