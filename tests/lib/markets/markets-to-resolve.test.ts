import { describe, it, expect, vi } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'
import { getMarketsToResolve } from '@/lib/markets/markets-to-resolve'

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  return { supabase: { rpc } as unknown as DbClient, rpc }
}

describe('getMarketsToResolve', () => {
  it('reads the list and its uncapped total from one RPC', async () => {
    const { supabase, rpc } = client({
      data: [
        { id: 'm1', title: 'One', close_at: '2026-09-25T12:00:00+00:00', total: 12 },
        { id: 'm2', title: 'Two', close_at: '2026-09-25T13:00:00+00:00', total: 12 },
      ],
      error: null,
    })
    expect(await getMarketsToResolve(supabase)).toEqual({
      total: 12,
      markets: [
        { id: 'm1', title: 'One', closeAt: '2026-09-25T12:00:00+00:00' },
        { id: 'm2', title: 'Two', closeAt: '2026-09-25T13:00:00+00:00' },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('markets_to_resolve')
  })

  it('is zero with nothing waiting', async () => {
    const { supabase } = client({ data: [], error: null })
    expect(await getMarketsToResolve(supabase)).toEqual({ total: 0, markets: [] })
  })

  it('throws when the read fails', async () => {
    const { supabase } = client({ data: null, error: new Error('rpc failed') })
    await expect(getMarketsToResolve(supabase)).rejects.toThrow('rpc failed')
  })
})
