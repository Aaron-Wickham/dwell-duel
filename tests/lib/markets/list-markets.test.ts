import { describe, it, expect } from 'vitest'
import { countOpenMarkets, listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { decodeCursor } from '@/lib/pagination/cursor'
import { fakeSupabase } from '../fake-supabase'

const RESOLUTION_EMBED = 'current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at)'

function marketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f',
    title: 'Will it rain?',
    kind: 'binary',
    status: 'resolved',
    close_at: '2026-09-20T09:00:00+00:00',
    created_at: '2026-09-19T09:00:00.123456+00:00',
    line: null,
    edited_at: null,
    current_resolution: { outcome_id: 'o-yes', resolved_at: '2026-09-21T09:00:00+00:00' },
    market_outcomes: [
      { id: 'o-no', label: 'No', pool_total: 5 },
      { id: 'o-yes', label: 'Yes', pool_total: 15 },
    ],
    ...overrides,
  }
}

describe('listOpenMarkets', () => {
  it('reads only open markets, 50 soonest to close first, with the resolution embedded in the same request', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [marketRow({ status: 'open', current_resolution: null })] }))

    const page = await listOpenMarkets(client, { top: null, bottom: null })

    expect(queries).toHaveLength(1)
    expect(queries[0].select).toContain(RESOLUTION_EMBED)
    expect(queries[0].in).toEqual([['status', ['open']]])
    expect(queries[0].limit).toBe(50)
    expect(queries[0].order.slice(0, 2)).toEqual([
      ['close_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(page.next).toBeNull()
    expect(page.rows).toEqual([
      {
        id: '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f',
        title: 'Will it rain?',
        kind: 'binary',
        status: 'open',
        closeAt: '2026-09-20T09:00:00+00:00',
        createdAt: '2026-09-19T09:00:00.123456+00:00',
        resolvedOutcomeLabel: null,
        resolvedAt: null,
        line: null,
        edited: false,
        outcomes: [
          { id: 'o-no', label: 'No', poolTotal: 5 },
          { id: 'o-yes', label: 'Yes', poolTotal: 15 },
        ],
      },
    ])
  })

  it('probes only the keys of the next open markets, with the same filter and order', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      marketRow({ id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(1000 - i).padStart(12, '0')}`, status: 'open', current_resolution: null }),
    )
    const probed = [{ id: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001', close_at: '2026-09-21T09:00:00+00:00' }]
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? rows : probed }))

    const page = await listOpenMarkets(client, { top: null, bottom: null })

    const [read, probe] = queries
    expect(probe.select).toBe('id, close_at')
    expect(probe.or).toEqual([
      'and(close_at.gte."2026-09-20T09:00:00+00:00",or(close_at.gt."2026-09-20T09:00:00+00:00",and(close_at.eq."2026-09-20T09:00:00+00:00",id.gt."0b9c3f5e-8a1d-4c2b-9e7f-000000000951")))',
    ])
    expect(probe.in).toEqual([['status', ['open']]])
    expect(probe.order).toEqual(read.order.slice(0, 2))
    expect(page.rows).toHaveLength(50)
    expect(page.next).toMatchObject({ kind: 'extend', firstId: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001' })
    expect(decodeCursor(page.next?.cursor)).toEqual({ ts: '2026-09-21T09:00:00+00:00', id: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001' })
  })

  it('reads only markets still open for bets when given an upcoming bound, and only past-close ones when not', async () => {
    const at = '2026-09-20T12:00:00.000Z'
    const upcoming = fakeSupabase(() => ({ data: [] }))
    await listOpenMarkets(upcoming.client, { top: null, bottom: null }, { upcoming: true, at })
    expect(upcoming.queries[0].gt).toEqual([['close_at', at]])
    expect(upcoming.queries[0].lte).toEqual([])

    const overdue = fakeSupabase(() => ({ data: [] }))
    await listOpenMarkets(overdue.client, { top: null, bottom: null }, { upcoming: false, at })
    expect(overdue.queries[0].lte).toEqual([['close_at', at]])
    expect(overdue.queries[0].gt).toEqual([])
  })

  it('adds no close-time bound by default', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    await listOpenMarkets(client, { top: null, bottom: null })
    expect(queries[0].gt).toEqual([])
    expect(queries[0].lte).toEqual([])
  })

  it('ignores a cursor whose id is not a market id', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    const page = await listOpenMarkets(client, { top: { ts: '2026-09-19T09:00:00Z', id: '42' }, bottom: null })
    expect(queries[0].or).toEqual([])
    expect(page.windowed).toBe(false)
  })
})

describe('listClosedMarkets', () => {
  it('reads resolved and voided markets as one list of 50, labelling each resolution from the embed', async () => {
    const { client, queries } = fakeSupabase(() => ({
      data: [marketRow(), marketRow({ id: '1b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f', status: 'voided', current_resolution: null })],
    }))

    const page = await listClosedMarkets(client, { top: null, bottom: null })

    expect(queries).toHaveLength(1)
    expect(queries[0].in).toEqual([['status', ['resolved', 'voided']]])
    expect(queries[0].limit).toBe(50)
    expect(page.rows.map((m) => [m.status, m.resolvedOutcomeLabel, m.resolvedAt])).toEqual([
      ['resolved', 'Yes', '2026-09-21T09:00:00+00:00'],
      ['voided', null, null],
    ])
    expect(page.next).toBeNull()
  })

  it('probes only the keys of the next closed markets, with the same filter and order, and no embeds', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      marketRow({ id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(1000 - i).padStart(12, '0')}` }),
    )
    const probed = [marketRow({ id: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001', created_at: '2026-09-18T09:00:00+00:00' })]
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? rows : probed }))

    const page = await listClosedMarkets(client, { top: null, bottom: null })

    const [read, probe] = queries
    expect(read.select).toContain(RESOLUTION_EMBED)
    expect(probe.select).toBe('id, created_at')
    expect(probe.in).toEqual(read.in)
    expect(probe.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(read.order).toEqual([
      ...probe.order,
      ['created_at', { referencedTable: 'market_outcomes' }],
      ['label', { referencedTable: 'market_outcomes' }],
    ])
    expect(page.next).toMatchObject({ kind: 'extend', firstId: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001' })
  })

  it('ignores a cursor whose id is not a market id', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    await listClosedMarkets(client, { top: null, bottom: { ts: '2026-09-19T09:00:00Z', id: '42' } })
    expect(queries[0].or).toEqual([])
    expect(queries[0].limit).toBe(50)
  })
})

describe('countOpenMarkets', () => {
  it('counts open markets without reading any rows', async () => {
    const { client, queries } = fakeSupabase(() => ({ count: 7 }))
    expect(await countOpenMarkets(client)).toBe(7)
    expect(queries[0].selectOptions).toEqual({ count: 'exact', head: true })
    expect(queries[0].eq).toEqual([['status', 'open']])
  })

  it('throws when the count fails', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('count failed') }))
    await expect(countOpenMarkets(client)).rejects.toThrow('count failed')
  })
})
