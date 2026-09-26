import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { adjustBalanceAction } from '@/lib/members/adjust-balance'

const BALANCE_VIOLATION = {
  code: '23514',
  message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"',
}

function stubProfile(displayName: string, balance: number) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { display_name: displayName, balance }, error: null }) }))
  supabase.from.mockReturnValue({ select: () => ({ eq }) })
  return eq
}

function adjustForm(amount: string, reason = 'Because') {
  const form = new FormData()
  form.set('amount', amount)
  form.set('reason', reason)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
})

describe('adjustBalanceAction', () => {
  it("turns a balance-check violation into friendly copy naming the target member and their current balance", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const eq = stubProfile('Mia', 15)

    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('-50'))

    expect(state).toEqual({ formError: 'That would take Mia’s balance below zero — they have 15 DC.', field: 'amount' })
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'p-mia')
  })

  it('falls back to the raw message when the profile read fails', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: null, error: { message: 'not found' } }) }))
    supabase.from.mockReturnValue({ select: () => ({ eq }) })

    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('-50'))

    expect(state).toEqual({ formError: BALANCE_VIOLATION.message })
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'something else went wrong' } })

    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('10'))

    expect(state).toEqual({ formError: 'something else went wrong' })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
