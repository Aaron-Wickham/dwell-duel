import { describe, it, expect } from 'vitest'
import { getMarketBets } from '@/lib/markets/get-market'
import { decodeCursor } from '@/lib/pagination/cursor'
import { fakeSupabase } from '../fake-supabase'

function betRow(n: number) {
  return {
    id: n,
    outcome_id: 'o-yes',
    amount: n,
    created_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
    profile_id: 'p-bob',
    profiles: { display_name: 'Bob' },
  }
}

describe('getMarketBets', () => {
  it("reads the market's newest 50 bets, and points Show more at the 50th one past them", async () => {
    const shown = Array.from({ length: 50 }, (_, i) => betRow(200 - i))
    const probed = Array.from({ length: 50 }, (_, i) => betRow(150 - i))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await getMarketBets(client, 'm1', { top: null, bottom: null })

    expect(queries.map((q) => [q.table, q.eq, q.limit])).toEqual([
      ['bets', [['market_id', 'm1']], 50],
      ['bets', [['market_id', 'm1']], 50],
    ])
    expect(page.rows[0]).toEqual({
      id: 200,
      outcomeId: 'o-yes',
      amount: 200,
      createdAt: betRow(200).created_at,
      profileId: 'p-bob',
      bettorName: 'Bob',
    })
    expect(page.rows).toHaveLength(50)
    expect(decodeCursor(page.next?.cursor)).toEqual({ ts: betRow(101).created_at, id: '101' })
  })

  it('ignores a cursor whose id is not a bet id', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    const page = await getMarketBets(client, 'm1', { top: { ts: '2026-09-26T10:00:00Z', id: 'bet:1' }, bottom: null })
    expect(queries[0].or).toEqual([])
    expect(page.windowed).toBe(false)
  })
})
