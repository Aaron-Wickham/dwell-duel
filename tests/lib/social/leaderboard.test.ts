import { describe, it, expect } from 'vitest'
import { getLeaderboardPage } from '@/lib/social/leaderboard'
import { RANK_ORDER, aheadOfRankFilter, decodeRankCursor, type RankCursor } from '@/lib/pagination/rank-cursor'
import { fakeSupabase, type RecordedQuery } from '../fake-supabase'

function profile(n: number, balance: number) {
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, display_name: `Member ${String(n).padStart(3, '0')}`, balance }
}

const isCount = (q: RecordedQuery) => (q.selectOptions as { head?: boolean } | undefined)?.head === true

describe('getLeaderboardPage', () => {
  it('reads the top 50 in board order, ranks ties together, and counts nothing', async () => {
    // Pairs share a balance, so ranks go 1, 1, 3, 3, …
    const shown = Array.from({ length: 50 }, (_, i) => profile(i, 1000 - Math.floor(i / 2)))
    const probed = Array.from({ length: 50 }, (_, i) => profile(50 + i, 975 - Math.floor(i / 2)))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await getLeaderboardPage(client, { top: null, bottom: null })

    expect(queries).toHaveLength(2)
    const [read, probe] = queries
    expect(read.select).toBe('id, display_name, balance, avatar_path')
    expect(read.order).toEqual([
      ['balance', { ascending: false }],
      ['display_name', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(read.limit).toBe(50)
    expect(read.or).toEqual([])
    expect(probe.or).toEqual([RANK_ORDER.after({ balance: 976, name: 'Member 049', id: shown[49].id })])
    expect(page.windowed).toBe(false)
    expect(page.rows.slice(0, 4).map((m) => [m.displayName, m.balance, m.rank])).toEqual([
      ['Member 000', 1000, 1],
      ['Member 001', 1000, 1],
      ['Member 002', 999, 3],
      ['Member 003', 999, 3],
    ])
    expect(page.next).toMatchObject({ kind: 'extend', firstId: probed[0].id })
    expect(decodeRankCursor(page.next?.cursor)).toEqual({ balance: 951, name: 'Member 099', id: probed[49].id })
  })

  it('ranks a window against the whole board, across a tie that started before it', async () => {
    // Three members have more than 100, and two more at 100 come before the window's first row.
    const shown = [profile(5, 100), profile(6, 100), profile(7, 90), profile(8, 90), profile(9, 80)]
    const top: RankCursor = { balance: 100, name: 'Member 005', id: shown[0].id }
    const { client, queries } = fakeSupabase((query) => {
      if (!isCount(query)) return { data: shown }
      return { count: query.gt.length > 0 ? 3 : 5 }
    })

    const page = await getLeaderboardPage(client, { top, bottom: null })

    expect(page.windowed).toBe(true)
    expect(page.rows.map((m) => [m.displayName, m.rank])).toEqual([
      ['Member 005', 4],
      ['Member 006', 4],
      ['Member 007', 8],
      ['Member 008', 8],
      ['Member 009', 10],
    ])
    const counts = queries.filter(isCount)
    expect(counts.map((q) => [q.gt, q.or])).toEqual([
      [[['balance', 100]], []],
      [[], [aheadOfRankFilter(top)]],
    ])
    expect(queries[0].or).toEqual([RANK_ORDER.range({ top, bottom: null })])
  })

  it('reads an empty window with no counts', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    const page = await getLeaderboardPage(client, { top: { balance: 0, name: 'Z', id: profile(1, 0).id }, bottom: null })
    expect(page).toEqual({ rows: [], next: null, windowed: true })
    expect(queries).toHaveLength(1)
  })

  it('throws when a rank count fails, so the error page shows rather than wrong ranks', async () => {
    const { client } = fakeSupabase((query) => (isCount(query) ? { error: new Error('count failed') } : { data: [profile(1, 5)] }))
    await expect(
      getLeaderboardPage(client, { top: { balance: 5, name: 'Member 001', id: profile(1, 5).id }, bottom: null }),
    ).rejects.toThrow('count failed')
  })
})
