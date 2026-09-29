import { describe, it, expect } from 'vitest'
import { listFeed } from '@/lib/social/list-feed'
import { fakeSupabase } from '../fake-supabase'

function eventRow(n: number) {
  return {
    id: `bet:${n}`,
    kind: 'bet_placed',
    occurred_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
    actor_id: 'p-alice',
    market_id: 'm1',
    amount: 5,
    actor: { display_name: 'Alice' },
    market: { title: 'Will it rain?' },
    outcome: { label: 'Yes' },
    task_completion: null,
    parlay: null,
  }
}

describe('listFeed', () => {
  it('probes only the keys of the next 50 events, with the same filters and order as the range read', async () => {
    const shown = Array.from({ length: 50 }, (_, i) => eventRow(200 - i))
    const probed = Array.from({ length: 50 }, (_, i) => eventRow(150 - i))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await listFeed(client, { actorId: 'p-alice', page: { top: null, bottom: null } })

    const [read, probe] = queries
    expect(read.select).toContain('actor:profiles!activity_events_actor_id_fkey!inner(display_name)')
    expect(probe.select).toBe('id, occurred_at')
    expect(probe.is).toEqual([['hidden_at', null]])
    expect(probe.eq).toEqual([['actor_id', 'p-alice']])
    expect(probe.order).toEqual(read.order)
    expect(probe.limit).toBe(50)
    expect(page.rows[0]).toMatchObject({ id: 'bet:200', actorName: 'Alice', marketTitle: 'Will it rain?' })
    expect(page.next).toMatchObject({ kind: 'extend', firstId: 'bet:150' })
  })
})
