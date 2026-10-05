import { describe, it, expect, vi } from 'vitest'
import { readNetWorths } from '@/lib/members/net-worth'
import type { DbClient } from '@/lib/supabase/database'

// A stand-in for the two RPCs: the board knows the active members, member_standing everyone.
function fakeClient(board: Record<string, number>, standing: Record<string, number>) {
  const boardCalls: string[][] = []
  const rpc = vi.fn((fn: string, args?: { p_profile_id: string }) => {
    if (fn === 'leaderboard_net_worth') {
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => {
            boardCalls.push(ids)
            return { data: ids.filter((id) => id in board).map((id) => ({ id, score: board[id] })), error: null }
          },
        }),
      }
    }
    return {
      maybeSingle: async () => {
        const id = args!.p_profile_id
        return { data: id in standing ? { score: standing[id] } : null, error: null }
      },
    }
  })
  return { client: { rpc } as unknown as DbClient, rpc, boardCalls }
}

describe('readNetWorths', () => {
  it('reads net worth off the board, chunking the ids', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const { client, boardCalls } = fakeClient(Object.fromEntries(ids.map((id, i) => [id, i * 10])), {})
    const worth = await readNetWorths(client, ids)
    expect(boardCalls.map((c) => c.length)).toEqual([50, 50, 20])
    expect(worth.get('m3')).toBe(30)
    expect(worth.size).toBe(120)
  })

  it('falls back to member_standing for a removed member, who is off the board', async () => {
    const { client, rpc } = fakeClient({ a: 100 }, { gone: 80 })
    const worth = await readNetWorths(client, ['a', 'gone', 'unknown'])
    expect(worth.get('a')).toBe(100)
    expect(worth.get('gone')).toBe(80)
    expect(worth.has('unknown')).toBe(false)
    expect(rpc).toHaveBeenCalledWith('member_standing', { p_profile_id: 'gone' })
    expect(rpc).not.toHaveBeenCalledWith('member_standing', { p_profile_id: 'a' })
  })
})
