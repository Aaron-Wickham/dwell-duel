import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMarket } from '@/lib/markets/get-market'

function chainableBuilder(result: { data: unknown; error: null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  builder.eq = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => result)
  return builder
}

describe('getMarket', () => {
  it('issues exactly one from() call, reading the resolution through the embed', async () => {
    const row = {
      id: 'market-1',
      title: 'Will it rain?',
      description: null,
      kind: 'binary',
      status: 'resolved',
      close_at: '2026-01-01T00:00:00Z',
      created_by: 'member-1',
      current_resolution_id: 'resolution-1',
      creator: { display_name: 'Alice' },
      market_outcomes: [
        { id: 'outcome-yes', label: 'Yes', pool_total: 40 },
        { id: 'outcome-no', label: 'No', pool_total: 10 },
      ],
      current_resolution: { outcome_id: 'outcome-yes', resolved_at: '2026-01-02T00:00:00Z' },
    }
    const select = vi.fn((_query: string) => chainableBuilder({ data: row, error: null }))
    const from = vi.fn(() => ({ select }))
    const supabase = { from } as unknown as SupabaseClient

    const market = await getMarket(supabase, 'market-1')

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('markets')
    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.calls[0][0]).toContain(
      'current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at, actual_value, payout_seed)',
    )
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe('2026-01-02T00:00:00Z')
    expect(market?.creatorName).toBe('Alice')
  })

  it('has no resolution time when the market has never been resolved', async () => {
    const row = {
      id: 'market-2',
      title: 'Open market',
      description: null,
      kind: 'binary',
      status: 'open',
      close_at: '2026-01-01T00:00:00Z',
      created_by: 'member-1',
      current_resolution_id: null,
      creator: { display_name: 'Alice' },
      market_outcomes: [{ id: 'outcome-yes', label: 'Yes', pool_total: 0 }],
      current_resolution: null,
    }
    const select = vi.fn(() => chainableBuilder({ data: row, error: null }))
    const from = vi.fn(() => ({ select }))
    const supabase = { from } as unknown as SupabaseClient

    const market = await getMarket(supabase, 'market-2')

    expect(from).toHaveBeenCalledTimes(1)
    expect(market?.resolvedOutcomeLabel).toBeNull()
    expect(market?.resolvedAt).toBeNull()
  })

  it('keeps outcomes in the order the creator typed them, read by position (#409)', async () => {
    const row = {
      id: 'market-3',
      title: 'Order',
      description: null,
      kind: 'multiple_choice',
      status: 'open',
      close_at: '2026-01-01T00:00:00Z',
      created_by: 'member-1',
      current_resolution_id: null,
      creator: { display_name: 'Alice' },
      market_outcomes: ['Ruth', 'Eli', 'Abe'].map((label) => ({ id: label, label, pool_total: 0 })),
      current_resolution: null,
    }
    const builder = chainableBuilder({ data: row, error: null })
    const select = vi.fn(() => builder)
    const market = await getMarket({ from: vi.fn(() => ({ select })) } as unknown as SupabaseClient, 'market-3')
    expect(builder.order).toHaveBeenCalledWith('position', { referencedTable: 'market_outcomes' })
    expect(market?.outcomes.map((o) => o.label)).toEqual(['Ruth', 'Eli', 'Abe'])
  })

  it('returns null, with no query at all beyond the one lookup, when the market is missing', async () => {
    const select = vi.fn(() => chainableBuilder({ data: null, error: null }))
    const from = vi.fn(() => ({ select }))
    const supabase = { from } as unknown as SupabaseClient

    const market = await getMarket(supabase, 'missing')

    expect(from).toHaveBeenCalledTimes(1)
    expect(market).toBeNull()
  })
})
