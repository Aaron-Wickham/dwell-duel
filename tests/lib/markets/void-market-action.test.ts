import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/push/notify', () => ({ afterAction: vi.fn(), notifyMarketResult: vi.fn() }))

import { voidMarketAction } from '@/lib/markets/void-market'

function reasonForm(reason: string) {
  const form = new FormData()
  form.set('reason', reason)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
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
      formError: 'Say why this market is being voided.',
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
      formError: 'This market has closed, so only an admin can void it.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
