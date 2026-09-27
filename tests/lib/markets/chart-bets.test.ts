import { describe, it, expect } from 'vitest'
import { getChartBets } from '@/lib/markets/chart-bets'
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
