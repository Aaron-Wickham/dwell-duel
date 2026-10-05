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

function reasonForm(reason: string) {
  const form = new FormData()
  form.set('reason', reason)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  maybeSingle.mockReset()
  getRole.mockReset()
  getRole.mockResolvedValue('member')
  revalidatePath.mockReset()
})

describe('voidMarketAction', () => {
  it('sends the trimmed reason and refreshes the layout', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    expect(await voidMarketAction('m1', undefined, reasonForm('  Duplicate market\r\n'))).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('void_market', { p_market_id: 'm1', p_reason: 'Duplicate market' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('asks for a reason before calling the database', async () => {
    expect(await voidMarketAction('m1', undefined, reasonForm('   '))).toEqual({
      formError: 'Say why this market is being called off.',
      field: 'reason',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('refuses a reason over the limit before calling the database', async () => {
    expect(await voidMarketAction('m1', undefined, reasonForm('r'.repeat(501)))).toEqual({
      formError: 'Reason can be at most 500 characters.',
      field: 'reason',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('puts a closed market in plain words', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'this market has closed, so only an admin can void it' } })
    expect(await voidMarketAction('m1', undefined, reasonForm('Rained off'))).toEqual({
      formError: 'This market has closed, so only an admin can call it off.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('voidMarketAction replay', () => {
  const NOT_VOIDABLE = { code: 'P0001', message: 'only an unresolved, unvoided market can be voided' }
  const REFUSAL = { formError: 'This market already has a result or was already called off.' }
  const OPEN_UNTIL = new Date(Date.now() + 3_600_000).toISOString()
  const CLOSED_AT = new Date(Date.now() - 3_600_000).toISOString()
  const run = () => voidMarketAction('market-1', undefined, reasonForm('Duplicate'))

  beforeEach(() => supabase.rpc.mockResolvedValue({ data: null, error: NOT_VOIDABLE }))

  it('treats "not voidable" as success when the market is now voided, still open, and the caller made it', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'voided', created_by: 'member-1', close_at: OPEN_UNTIL } })
    expect(await run()).toBeUndefined()
  })

  it('refuses the creator once the market has closed, since only an admin may void it then', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'voided', created_by: 'member-1', close_at: CLOSED_AT } })
    expect(await run()).toEqual(REFUSAL)
  })

  it('still refuses a market that was resolved', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'resolved', created_by: 'member-1', close_at: OPEN_UNTIL } })
    expect(await run()).toEqual(REFUSAL)
  })

  it('treats it as success for an admin who did not make the market, closed or not', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'voided', created_by: 'someone-else', close_at: CLOSED_AT } })
    getRole.mockResolvedValue('admin')
    expect(await run()).toBeUndefined()
  })

  it('refuses a plain member who could never have voided it', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'voided', created_by: 'someone-else', close_at: OPEN_UNTIL } })
    expect(await run()).toEqual(REFUSAL)
  })
})
