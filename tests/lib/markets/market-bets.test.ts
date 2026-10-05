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
  // #390: ten at a time, so the comments under them aren't buried.
  it("reads the market's newest 10 bets, and points Show more at the 10th one past them", async () => {
    const shown = Array.from({ length: 10 }, (_, i) => betRow(200 - i))
    const probed = Array.from({ length: 10 }, (_, i) => betRow(190 - i))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await getMarketBets(client, 'm1', { top: null, bottom: null })

    expect(queries.map((q) => [q.table, q.select, q.eq, q.limit])).toEqual([
      ['bets', 'id, outcome_id, amount, created_at, profile_id, profiles(display_name, avatar_path)', [['market_id', 'm1']], 10],
      ['bets', 'id, created_at', [['market_id', 'm1']], 10],
    ])
    expect(queries[1].order).toEqual(queries[0].order)
    expect(page.rows[0]).toEqual({
      id: 200,
      outcomeId: 'o-yes',
      amount: 200,
      createdAt: betRow(200).created_at,
      profileId: 'p-bob',
      bettorName: 'Bob',
      bettorAvatarSrc: null,
    })
    expect(page.rows).toHaveLength(10)
    expect(decodeCursor(page.next?.cursor)).toEqual({ ts: betRow(181).created_at, id: '181' })
    expect(page.next?.firstId).toBe('190')
  })

  it('ignores a cursor whose id is not a bet id', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    const page = await getMarketBets(client, 'm1', { top: { ts: '2026-09-26T10:00:00Z', id: 'bet:1' }, bottom: null })
    expect(queries[0].or).toEqual([])
    expect(page.windowed).toBe(false)
  })
})
