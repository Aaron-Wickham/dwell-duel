import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Next's data cache, as unstable_cache uses it: keyed by the key parts and the arguments, a hit
// never calls the function, and a throw is never stored. `reads` counts lookups.
const { store, reads, options } = vi.hoisted(() => ({ store: new Map<string, unknown>(), reads: { count: 0 }, options: [] as unknown[] }))
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[], opts: unknown) => {
    options.push(opts)
    return async (...args: A): Promise<R> => {
      reads.count += 1
      const key = JSON.stringify([keyParts, args])
      if (store.has(key)) return store.get(key) as R
      const value = await fn(...args)
      store.set(key, value)
      return value
    }
  },
}))

import { batchKey, expandSparkline, listSparklines, readSparklines } from '@/lib/markets/sparklines'

type RpcResponse = { data?: unknown; error?: unknown }

// A minimal stand-in for the one RPC call this module makes: fake-supabase.ts only stubs
// .from(), and market_sparks is reached through .rpc(), not a table read.
function fakeRpc(respond: (params: { p_market_ids: string[] }, call: number) => RpcResponse) {
  const calls: { p_market_ids: string[] }[] = []
  const rpc = vi.fn(async (_fn: string, params: { p_market_ids: string[] }) => {
    calls.push(params)
    return { data: null, error: null, ...respond(params, calls.length - 1) }
  })
  return { client: { rpc } as unknown as SupabaseClient, calls }
}

const T = Date.parse('2026-09-26T10:00:00Z') / 1000

function sparkRow(marketId: string, points: number[][] = [[T, 1, 0]]) {
  return { market_id: marketId, outcome_ids: ['yes', 'no'], points }
}

// Unseeded unless a test says otherwise, so the RPC's points pass through untouched.
const unseeded = (id: string, version = '1') => ({
  id,
  version,
  seedPerOutcome: 0,
  createdAt: '2026-09-25T09:00:00Z',
  outcomeIds: ['yes', 'no'],
})
const unseededAll = (ids: string[]) => ids.map((id) => unseeded(id))
const allRows = (params: { p_market_ids: string[] }) => ({ data: params.p_market_ids.map((id) => sparkRow(id)) })

beforeEach(() => {
  store.clear()
  reads.count = 0
  options.length = 0
})

describe('expandSparkline', () => {
  it('turns each compact point back into a time in milliseconds and a share per outcome', () => {
    expect(expandSparkline({ outcomeIds: ['yes', 'no'], points: [[T, 0.25, 0.75], [T + 60, 0.4, 0.6]] })).toEqual([
      { t: T * 1000, shares: { yes: 0.25, no: 0.75 } },
      { t: (T + 60) * 1000, shares: { yes: 0.4, no: 0.6 } },
    ])
  })
})

describe('listSparklines', () => {
  it('reads the listed markets in chunks of at most 50 ids, one row per market', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const { client, calls } = fakeRpc(allRows)

    const byMarket = await listSparklines(client, [unseededAll(ids)])

    expect(calls.map((c) => c.p_market_ids.length)).toEqual([50, 50, 20])
    expect(calls.flatMap((c) => c.p_market_ids)).toEqual(ids)
    expect([...byMarket.keys()]).toEqual(ids)
    expect(byMarket.get('m119')).toEqual([{ t: T * 1000, shares: { yes: 1, no: 0 } }])
  })

  it('reads the cache once per list, and the database only for a list whose versions moved (#252)', async () => {
    const { client, calls } = fakeRpc(allRows)
    const open = (version: string) => [unseeded('a', version), unseeded('b', '7')]
    const resolved = [unseeded('r1', 'settled'), unseeded('r2', 'settled')]

    await listSparklines(client, [open('3'), resolved])
    expect(reads.count).toBe(2)
    // A live refresh after a bet on a: only the open list is fetched again.
    await listSparklines(client, [open('4'), resolved])
    // And one with nothing new fetches nothing.
    const byMarket = await listSparklines(client, [open('4'), resolved])

    expect(calls.map((c) => c.p_market_ids)).toEqual([['a', 'b'], ['r1', 'r2'], ['a', 'b']])
    expect(reads.count).toBe(6)
    expect(byMarket.get('r2')).toEqual([{ t: T * 1000, shares: { yes: 1, no: 0 } }])
  })

  it('keys a batch by its markets and versions, whatever their order', () => {
    expect(batchKey([unseeded('a', '1'), unseeded('b', '2')])).toBe(batchKey([unseeded('b', '2'), unseeded('a', '1')]))
    expect(batchKey([unseeded('a', '1'), unseeded('b', '2')])).not.toBe(batchKey([unseeded('a', '1'), unseeded('b', '3')]))
  })

  it('lets an entry expire after a week', async () => {
    const { client } = fakeRpc(allRows)
    await listSparklines(client, [unseededAll(['m1'])])
    expect(options).toEqual([{ revalidate: 7 * 24 * 60 * 60 }])
  })

  it('caches a market nobody has bet on as having no points, so it isn’t asked about again', async () => {
    const { client, calls } = fakeRpc(() => ({ data: [sparkRow('busy'), sparkRow('unasked')] }))

    const byMarket = await listSparklines(client, [unseededAll(['busy', 'quiet'])])
    await listSparklines(client, [unseededAll(['busy', 'quiet'])])

    expect([...byMarket.keys()]).toEqual(['busy', 'quiet'])
    expect(byMarket.get('quiet')).toEqual([])
    expect(byMarket.has('unasked')).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('starts a seeded market at an even split when it opened, before its first bet, as the market page does', async () => {
    const { client } = fakeRpc(() => ({ data: [sparkRow('seeded', [[T, 0.75, 0.25]])] }))
    const seeded = { ...unseeded('seeded'), seedPerOutcome: 20 }

    const byMarket = await listSparklines(client, [[seeded]])

    expect(byMarket.get('seeded')).toEqual([
      { t: Date.parse('2026-09-25T09:00:00Z'), shares: { yes: 0.5, no: 0.5 } },
      { t: T * 1000, shares: { yes: 0.75, no: 0.25 } },
    ])
  })

  it('gives a seeded market nobody has bet on just its even start, so its card draws a flat line', async () => {
    const { client } = fakeRpc(() => ({ data: [] }))
    const byMarket = await listSparklines(client, [[{ ...unseeded('quiet'), seedPerOutcome: 20 }]])
    expect(byMarket.get('quiet')).toEqual([{ t: Date.parse('2026-09-25T09:00:00Z'), shares: { yes: 0.5, no: 0.5 } }])
  })

  it('makes no request for no markets', async () => {
    const { client, calls } = fakeRpc(() => ({ data: [] }))
    expect(await listSparklines(client, [[], []])).toEqual(new Map())
    expect(calls).toHaveLength(0)
  })

  it('throws when a chunk’s RPC call fails, and caches nothing from it', async () => {
    const failing = fakeRpc(() => ({ error: new Error('rpc failed') }))
    await expect(listSparklines(failing.client, [unseededAll(['m1'])])).rejects.toThrow('rpc failed')

    const working = fakeRpc(allRows)
    await listSparklines(working.client, [unseededAll(['m1'])])
    expect(working.calls).toHaveLength(1)
  })
})

describe('readSparklines', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs and resolves to an empty map when the sparkline read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeRpc(() => ({ error: new Error('rpc failed') }))

    const byMarket = await readSparklines(client, [unseededAll(['m1'])])

    expect(byMarket).toEqual(new Map())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('Market sparklines failed to load')
  })

  it('returns each market’s points when the read succeeds', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeRpc(allRows)

    const byMarket = await readSparklines(client, [unseededAll(['m1'])])

    expect(byMarket).toEqual(new Map([['m1', [{ t: T * 1000, shares: { yes: 1, no: 0 } }]]]))
    expect(spy).not.toHaveBeenCalled()
  })
})
