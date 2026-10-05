import { describe, it, expect, vi } from 'vitest'
import { readNetWorths } from '@/lib/members/net-worth'
import type { DbClient } from '@/lib/supabase/database'

// A stand-in for member_net_worths, which knows every member, removed or not.
function fakeClient(worths: Record<string, number>) {
  const calls: string[][] = []
  const rpc = vi.fn(async (_fn: string, args: { p_ids: string[] }) => {
    calls.push(args.p_ids)
    return { data: args.p_ids.filter((id) => id in worths).map((id) => ({ id, score: worths[id] })), error: null }
  })
  return { client: { rpc } as unknown as DbClient, rpc, calls }
}

describe('readNetWorths', () => {
  it('reads every member in chunks of the ids', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const { client, rpc, calls } = fakeClient(Object.fromEntries(ids.map((id, i) => [id, i * 10])))
    const worth = await readNetWorths(client, ids)
    expect(rpc).toHaveBeenCalledWith('member_net_worths', { p_ids: ids.slice(0, 50) })
    expect(calls.map((c) => c.length)).toEqual([50, 50, 20])
    expect(worth.get('m3')).toBe(30)
    expect(worth.size).toBe(120)
  })

  it('leaves out an id with no profile', async () => {
    const { client } = fakeClient({ a: 100, gone: 80 })
    const worth = await readNetWorths(client, ['a', 'gone', 'unknown'])
    expect(worth).toEqual(new Map([['a', 100], ['gone', 80]]))
  })

  it('makes no call for no ids', async () => {
    const { client, rpc } = fakeClient({})
    expect((await readNetWorths(client, [])).size).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws what the database refused with', async () => {
    const error = { message: 'too many members in one read' }
    const client = { rpc: async () => ({ data: null, error }) } as unknown as DbClient
    await expect(readNetWorths(client, ['a'])).rejects.toBe(error)
  })
})
