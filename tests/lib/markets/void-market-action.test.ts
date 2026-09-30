import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const chain = { select: () => chain, eq: () => chain, maybeSingle }
  return { supabase: { rpc: vi.fn(), from: vi.fn(() => chain) }, revalidatePath: vi.fn(), maybeSingle }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/push/notify', () => ({ afterAction: vi.fn(), notifyMarketResult: vi.fn() }))

import { voidMarketAction } from '@/lib/markets/void-market'

const NOT_VOIDABLE = { code: 'P0001', message: 'only an unresolved, unvoided market can be voided' }

beforeEach(() => {
  supabase.rpc.mockReset()
  maybeSingle.mockReset()
  revalidatePath.mockReset()
})

describe('voidMarketAction replay', () => {
  it('treats "not voidable" as success when the market is now voided', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: NOT_VOIDABLE })
    maybeSingle.mockResolvedValue({ data: { status: 'voided' } })
    expect(await voidMarketAction('market-1', undefined, new FormData())).toBeUndefined()
  })

  it('still refuses a market that was resolved', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: NOT_VOIDABLE })
    maybeSingle.mockResolvedValue({ data: { status: 'resolved' } })
    expect(await voidMarketAction('market-1', undefined, new FormData())).toEqual({
      formError: 'Only an unresolved, unvoided market can be voided.',
    })
  })
})
