import { describe, it, expect } from 'vitest'
import { getLeaderboardPage } from '@/lib/social/leaderboard'
import { RANK_ORDER, decodeRankCursor, type RankCursor } from '@/lib/pagination/rank-cursor'
import { fakeSupabase } from '../fake-supabase'

function row(n: number, score: number, rank: number) {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    display_name: `Member ${String(n).padStart(3, '0')}`,
    avatar_path: null,
    score,
    rank,
  }
}

describe('getLeaderboardPage', () => {
  it('reads the top 50 of the net-worth board in board order, with the ranks SQL gave them', async () => {
    // Pairs share a score, so ranks go 1, 1, 3, 3, …
    const shown = Array.from({ length: 50 }, (_, i) => row(i, 1000 - Math.floor(i / 2), i - (i % 2) + 1))
    const probed = Array.from({ length: 50 }, (_, i) => row(50 + i, 975 - Math.floor(i / 2), 51 + i - (i % 2)))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await getLeaderboardPage(client, 'all', { top: null, bottom: null })

    expect(queries).toHaveLength(2)
    const [read, probe] = queries
    expect(read).toMatchObject({ table: 'leaderboard_net_worth', rpc: true, select: 'id, display_name, avatar_path, score, rank', limit: 50 })
    expect(read.order).toEqual([
      ['score', { ascending: false }],
      ['display_name', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(read.or).toEqual([])
    expect(probe.or).toEqual([RANK_ORDER.after({ score: 976, name: 'Member 049', id: shown[49].id })])
    expect(page.windowed).toBe(false)
    expect(page.rows.slice(0, 4).map((m) => [m.displayName, m.score, m.rank])).toEqual([
      ['Member 000', 1000, 1],
      ['Member 001', 1000, 1],
      ['Member 002', 999, 3],
      ['Member 003', 999, 3],
    ])
    expect(page.next).toMatchObject({ kind: 'extend', firstId: probed[0].id })
    expect(decodeRankCursor(page.next?.cursor)).toEqual({ score: 951, name: 'Member 099', id: probed[49].id })
  })

  it("reads This month from the month's board, negative profits included", async () => {
    const shown = [row(1, 140, 1), row(2, 0, 2), row(3, -30, 3)]
    const { client, queries } = fakeSupabase(() => ({ data: shown }))

    const page = await getLeaderboardPage(client, 'month', { top: null, bottom: null })

    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({ table: 'leaderboard_month', rpc: true })
    expect(page.rows.map((m) => [m.score, m.rank])).toEqual([
      [140, 1],
      [0, 2],
      [-30, 3],
    ])
    expect(page.next).toBeNull()
  })

  it('filters a window by its cursor and keeps the whole-board ranks, with no counts', async () => {
    const shown = [row(5, 100, 4), row(6, 100, 4), row(7, 90, 8)]
    const top: RankCursor = { score: 100, name: 'Member 005', id: shown[0].id }
    const { client, queries } = fakeSupabase(() => ({ data: shown }))

    const page = await getLeaderboardPage(client, 'all', { top, bottom: null })

    expect(queries).toHaveLength(1)
    expect(queries[0].or).toEqual([RANK_ORDER.range({ top, bottom: null })])
    expect(page.windowed).toBe(true)
    expect(page.rows.map((m) => [m.displayName, m.rank])).toEqual([
      ['Member 005', 4],
      ['Member 006', 4],
      ['Member 007', 8],
    ])
  })

  it('throws when the read fails, so the error page shows rather than a wrong board', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('read failed') }))
    await expect(getLeaderboardPage(client, 'month', { top: null, bottom: null })).rejects.toThrow('read failed')
  })
})
