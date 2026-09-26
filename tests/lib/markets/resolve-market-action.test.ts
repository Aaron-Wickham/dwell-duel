import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { resolveMarketAction } from '@/lib/markets/resolve-market'

function outcomeForm(outcomeId: string) {
  const form = new FormData()
  form.set('outcome_id', outcomeId)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  revalidatePath.mockReset()
})

describe('resolveMarketAction', () => {
  it('turns a blocked override into the message naming who is short', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'clawback_short:[{"owed": 60, "balance": 20, "display_name": "Bob"}]' },
    })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-2'))

    expect(supabase.rpc).toHaveBeenCalledWith('resolve_market', { p_market_id: 'market-1', p_outcome_id: 'outcome-2' })
    expect(state).toEqual({
      formError:
        'Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'only an admin can change an already-resolved market' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-2'))

    expect(state).toEqual({ formError: 'only an admin can change an already-resolved market' })
  })

  it('refreshes the layout when the resolution goes through', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))

    expect(state).toBeUndefined()
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
