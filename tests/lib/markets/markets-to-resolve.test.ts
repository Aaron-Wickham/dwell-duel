import { describe, it, expect, vi } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'
import { getMarketsToResolve, nextResolveCheckAt } from '@/lib/markets/markets-to-resolve'
import { fakeSupabase } from '../fake-supabase'

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  return { supabase: { rpc } as unknown as DbClient, rpc }
}

describe('getMarketsToResolve', () => {
  it('reads the list and its uncapped total from one RPC', async () => {
    const { supabase, rpc } = client({
      data: [
        { id: 'm1', title: 'One', close_at: '2026-09-25T12:00:00+00:00', total: 12 },
        { id: 'm2', title: 'Two', close_at: '2026-09-25T13:00:00+00:00', total: 12 },
      ],
      error: null,
    })
    expect(await getMarketsToResolve(supabase)).toEqual({
      total: 12,
      markets: [
        { id: 'm1', title: 'One', closeAt: '2026-09-25T12:00:00+00:00' },
        { id: 'm2', title: 'Two', closeAt: '2026-09-25T13:00:00+00:00' },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('markets_to_resolve')
  })

  it('is zero with nothing waiting', async () => {
    const { supabase } = client({ data: [], error: null })
    expect(await getMarketsToResolve(supabase)).toEqual({ total: 0, markets: [] })
  })

  it('throws when the read fails', async () => {
    const { supabase } = client({ data: null, error: new Error('rpc failed') })
    await expect(getMarketsToResolve(supabase)).rejects.toThrow('rpc failed')
  })
})

describe('nextResolveCheckAt', () => {
  const NOW = Date.parse('2026-09-25T12:00:00Z')
  const HOUR = 60 * 60 * 1000

  it('gives a member the soonest close among their own open markets still to close', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [{ close_at: '2026-09-25T13:00:00+00:00' }] }))
    expect(await nextResolveCheckAt(client, 'p-me', false, NOW)).toBe('2026-09-25T13:00:00.000Z')
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({
      table: 'markets',
      select: 'close_at',
      eq: [
        ['status', 'open'],
        ['created_by', 'p-me'],
      ],
      gt: [['close_at', '2026-09-25T12:00:00.000Z']],
      order: [['close_at', { ascending: true }]],
      limit: 1,
    })
  })

  it('is null for a member with nothing about to close', async () => {
    const { client } = fakeSupabase(() => ({ data: [] }))
    expect(await nextResolveCheckAt(client, 'p-me', false, NOW)).toBeNull()
  })

  it('gives a reviewer the sooner of any market’s close and one reaching its 48 hours', async () => {
    const { client, queries } = fakeSupabase((_q, index) => ({
      // Any open market closes in 5 hours; one that closed 46 hours ago reaches 48 in 2.
      data: [{ close_at: new Date(index === 0 ? NOW + 5 * HOUR : NOW - 46 * HOUR).toISOString() }],
    }))
    expect(await nextResolveCheckAt(client, 'p-me', true, NOW)).toBe(new Date(NOW + 2 * HOUR).toISOString())
    expect(queries.map((q) => q.eq)).toEqual([[['status', 'open']], [['status', 'open']]])
    expect(queries.map((q) => q.gt)).toEqual([
      [['close_at', new Date(NOW).toISOString()]],
      [['close_at', new Date(NOW - 48 * HOUR).toISOString()]],
    ])
  })

  it('gives a reviewer the next close when nothing is waiting out its 48 hours sooner', async () => {
    const { client } = fakeSupabase(() => ({ data: [{ close_at: new Date(NOW + HOUR).toISOString() }] }))
    expect(await nextResolveCheckAt(client, 'p-me', true, NOW)).toBe(new Date(NOW + HOUR).toISOString())
  })

  it('throws when the read fails', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('db down') }))
    await expect(nextResolveCheckAt(client, 'p-me', false, NOW)).rejects.toThrow('db down')
  })
})
