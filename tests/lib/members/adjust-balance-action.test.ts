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

  it('still names the problem when the profile read fails, without the raw constraint text', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: null, error: { message: 'not found' } }) }))
    supabase.from.mockReturnValue({ select: () => ({ eq }) })

    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('-50'))

    expect(state).toEqual({ formError: 'That would take their balance below zero.', field: 'amount' })
  })

  it("words the RPC's own refusals and hides anything else (#203)", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'only the owner can adjust a balance' } })
    expect(await adjustBalanceAction('p-mia', undefined, adjustForm('10'))).toEqual({ formError: 'Only the owner can adjust a balance.' })

    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'relation "public.profiles" does not exist' } })
    expect(await adjustBalanceAction('p-mia', undefined, adjustForm('10'))).toEqual({ formError: 'Something went wrong. Try again.' })
    expect(log).toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('adjustBalanceAction reason limit', () => {
  it('refuses a reason over 200 characters without adjusting anything', async () => {
    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('10', 'r'.repeat(201)))

    expect(state).toEqual({ formError: 'Reason can be at most 200 characters.', field: 'reason' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('adjusts with a reason of exactly 200 characters, measured after trimming', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('10', ` ${'r'.repeat(200)} `))

    expect(state).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('adjust_balance', { p_profile_id: 'p-mia', p_amount: 10, p_reason: 'r'.repeat(200) })
  })
})
