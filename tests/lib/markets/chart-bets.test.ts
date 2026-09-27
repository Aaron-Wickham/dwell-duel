import { describe, it, expect, vi, afterEach } from 'vitest'
import { getChartBets, listChartBets, readCharts } from '@/lib/markets/chart-bets'
import { newerThanFilter } from '@/lib/pagination/keyset'
import { fakeSupabase } from '../fake-supabase'

function betRow(n: number, marketId = 'm1') {
  return {
    id: n,
    market_id: marketId,
    outcome_id: `o-${marketId}`,
    amount: n,
    created_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
  }
}

describe('getChartBets', () => {
  it('reads oldest first in pages of 500, each starting after the last row of the one before', async () => {
    const pages = [
      Array.from({ length: 500 }, (_, i) => betRow(i + 1)),
      Array.from({ length: 500 }, (_, i) => betRow(i + 501)),
      [betRow(1001)],
    ]
    const { client, queries } = fakeSupabase((_query, index) => ({ data: pages[index] }))

    const bets = await getChartBets(client, 'm1')

    expect(bets).toHaveLength(1001)
    expect(bets.at(-1)).toEqual({ outcomeId: 'o-m1', amount: 1001, createdAt: betRow(1001).created_at })
    expect(queries).toHaveLength(3)
    for (const q of queries) {
      expect(q.in).toEqual([['market_id', ['m1']]])
      expect(q.order).toEqual([
        ['created_at', { ascending: true }],
        ['id', { ascending: true }],
      ])
      expect(q.limit).toBe(500)
    }
    expect(queries[0].or).toEqual([])
    expect(queries[1].or).toEqual([newerThanFilter({ ts: 'created_at', id: 'id' }, { ts: betRow(500).created_at, id: '500' })])
    expect(queries[2].or).toEqual([newerThanFilter({ ts: 'created_at', id: 'id' }, { ts: betRow(1000).created_at, id: '1000' })])
  })

  it('stops after one request for a market with fewer than 500 bets', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [betRow(1), betRow(2)] }))
    expect(await getChartBets(client, 'm1')).toHaveLength(2)
    expect(queries).toHaveLength(1)
  })

  it('throws when a read fails', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('read failed') }))
    await expect(getChartBets(client, 'm1')).rejects.toThrow('read failed')
  })
})

describe('listChartBets', () => {
  it('reads the listed markets in chunks of at most 50 ids, and groups each one’s bets', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const { client, queries } = fakeSupabase((query) => {
      const part = query.in[0][1] as string[]
      return { data: part.map((id, i) => betRow(i + 1, id)) }
    })

    const byMarket = await listChartBets(client, ids)

    expect(queries.map((q) => (q.in[0][1] as string[]).length)).toEqual([50, 50, 20])
    expect(queries.flatMap((q) => q.in[0][1] as string[])).toEqual(ids)
    expect([...byMarket.keys()]).toEqual(ids)
    expect(byMarket.get('m119')).toEqual([{ outcomeId: 'o-m119', amount: 20, createdAt: betRow(20).created_at }])
  })

  it('makes no request for no markets', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    expect(await listChartBets(client, [])).toEqual(new Map())
    expect(queries).toHaveLength(0)
  })
})

describe('readCharts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs and resolves to an empty map when the chart read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeSupabase(() => ({ error: new Error('read failed') }))

    const byMarket = await readCharts(client, ['m1'])

    expect(byMarket).toEqual(new Map())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('Market charts failed to load')
  })

  it('returns the grouped points when the read succeeds', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeSupabase(() => ({ data: [betRow(1, 'm1')] }))

    const byMarket = await readCharts(client, ['m1'])

    expect(byMarket).toEqual(new Map([['m1', [{ outcomeId: 'o-m1', amount: 1, createdAt: betRow(1, 'm1').created_at }]]]))
    expect(spy).not.toHaveBeenCalled()
  })
})
