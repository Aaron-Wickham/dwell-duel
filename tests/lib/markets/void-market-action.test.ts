import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const chain = { select: () => chain, eq: () => chain, maybeSingle }
  return { supabase: { rpc: vi.fn(), from: vi.fn(() => chain) }, revalidatePath: vi.fn(), maybeSingle }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
const { getRole } = vi.hoisted(() => ({ getRole: vi.fn() }))
vi.mock('@/lib/auth/roles', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/roles')>()), getRole }))
vi.mock('@/lib/push/notify', () => ({ afterAction: vi.fn(), notifyMarketResult: vi.fn() }))

import { voidMarketAction } from '@/lib/markets/void-market'

const NOT_VOIDABLE = { code: 'P0001', message: 'only an unresolved, unvoided market can be voided' }

beforeEach(() => {
  supabase.rpc.mockReset()
  maybeSingle.mockReset()
  getRole.mockReset()
  getRole.mockResolvedValue('member')
  revalidatePath.mockReset()
})

describe('voidMarketAction replay', () => {
  it('treats "not voidable" as success when the market is now voided and the caller made it', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: NOT_VOIDABLE })
    maybeSingle.mockResolvedValue({ data: { status: 'voided', created_by: 'member-1' } })
    expect(await voidMarketAction('market-1', undefined, new FormData())).toBeUndefined()
  })

  it('still refuses a market that was resolved', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: NOT_VOIDABLE })
    maybeSingle.mockResolvedValue({ data: { status: 'resolved', created_by: 'member-1' } })
    expect(await voidMarketAction('market-1', undefined, new FormData())).toEqual({
      formError: 'Only an unresolved, unvoided market can be voided.',
    })
  })

  it('treats it as success for an admin who did not make the market', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: NOT_VOIDABLE })
    maybeSingle.mockResolvedValue({ data: { status: 'voided', created_by: 'someone-else' } })
    getRole.mockResolvedValue('admin')
    expect(await voidMarketAction('market-1', undefined, new FormData())).toBeUndefined()
  })

  it('refuses a plain member who could never have voided it', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: NOT_VOIDABLE })
    maybeSingle.mockResolvedValue({ data: { status: 'voided', created_by: 'someone-else' } })
    expect(await voidMarketAction('market-1', undefined, new FormData())).toEqual({
      formError: 'Only an unresolved, unvoided market can be voided.',
    })
  })
})
