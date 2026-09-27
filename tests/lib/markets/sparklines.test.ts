import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listSparklines, readSparklines } from '@/lib/markets/sparklines'

type RpcResponse = { data?: unknown; error?: unknown }

// A minimal stand-in for the one RPC call this module makes: fake-supabase.ts only stubs
// .from(), and market_sparklines is reached through .rpc(), not a table read.
function fakeRpc(respond: (params: { p_market_ids: string[] }, call: number) => RpcResponse) {
  const calls: { p_market_ids: string[] }[] = []
  const rpc = vi.fn(async (_fn: string, params: { p_market_ids: string[] }) => {
    calls.push(params)
    return { data: null, error: null, ...respond(params, calls.length - 1) }
  })
  return { client: { rpc } as unknown as SupabaseClient, calls }
}

function marketRow(marketId: string, points: { t: string; shares: Record<string, number> }[]) {
  return { market_id: marketId, points }
}

const ONE_POINT = [{ t: '2026-09-26T10:00:00Z', shares: { yes: 1 } }]

describe('listSparklines', () => {
  it('reads the listed markets in chunks of at most 50 ids, one row per market', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const { client, calls } = fakeRpc((params) => ({
      data: params.p_market_ids.map((id) => marketRow(id, ONE_POINT)),
    }))

    const byMarket = await listSparklines(client, ids)

    expect(calls.map((c) => c.p_market_ids.length)).toEqual([50, 50, 20])
    expect(calls.flatMap((c) => c.p_market_ids)).toEqual(ids)
    expect([...byMarket.keys()]).toEqual(ids)
    expect(byMarket.get('m119')).toEqual([{ t: Date.parse('2026-09-26T10:00:00Z'), shares: { yes: 1 } }])
  })

  it('gives a market with no row an empty list, and never a market that wasn’t asked for', async () => {
    const { client } = fakeRpc(() => ({
      data: [marketRow('busy', ONE_POINT), marketRow('unasked', ONE_POINT)],
    }))

    const byMarket = await listSparklines(client, ['busy', 'quiet'])

    expect([...byMarket.keys()]).toEqual(['busy', 'quiet'])
    expect(byMarket.get('quiet')).toEqual([])
    expect(byMarket.has('unasked')).toBe(false)
  })

  it('maps each point’s time to milliseconds and keeps its shares, in the order the function returns them', async () => {
    const { client } = fakeRpc(() => ({
      data: [
        marketRow('m1', [
          { t: '2026-09-26T10:00:00.123456+00:00', shares: { yes: 0.4, no: 0.6 } },
          { t: '2026-09-26T10:00:00.123456+00:00', shares: { yes: 0.5, no: 0.5 } },
          { t: '2026-09-26T10:01:00+00:00', shares: { yes: 0.6, no: 0.4 } },
        ]),
      ],
    }))

    const byMarket = await listSparklines(client, ['m1'])

    const tied = Date.parse('2026-09-26T10:00:00.123Z')
    expect(byMarket.get('m1')).toEqual([
      { t: tied, shares: { yes: 0.4, no: 0.6 } },
      { t: tied, shares: { yes: 0.5, no: 0.5 } },
      { t: Date.parse('2026-09-26T10:01:00Z'), shares: { yes: 0.6, no: 0.4 } },
    ])
  })

  it('makes no request for no markets', async () => {
    const { client, calls } = fakeRpc(() => ({ data: [] }))
    expect(await listSparklines(client, [])).toEqual(new Map())
    expect(calls).toHaveLength(0)
  })

  it('throws when a chunk’s RPC call fails', async () => {
    const { client } = fakeRpc(() => ({ error: new Error('rpc failed') }))
    await expect(listSparklines(client, ['m1'])).rejects.toThrow('rpc failed')
  })
})

describe('readSparklines', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs and resolves to an empty map when the sparkline read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeRpc(() => ({ error: new Error('rpc failed') }))

    const byMarket = await readSparklines(client, ['m1'])

    expect(byMarket).toEqual(new Map())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('Market sparklines failed to load')
  })

  it('returns each market’s points when the read succeeds', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeRpc((params) => ({ data: params.p_market_ids.map((id) => marketRow(id, ONE_POINT)) }))

    const byMarket = await readSparklines(client, ['m1'])

    expect(byMarket).toEqual(new Map([['m1', [{ t: Date.parse('2026-09-26T10:00:00Z'), shares: { yes: 1 } }]]]))
    expect(spy).not.toHaveBeenCalled()
  })
})
