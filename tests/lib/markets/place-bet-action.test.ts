import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { placeBetAction } from '@/lib/markets/place-bet'

const BALANCE_VIOLATION = {
  code: '23514',
  message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"',
}

function stubBalance(balance: number) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { balance }, error: null }) }))
  const select = vi.fn(() => ({ eq }))
  supabase.from.mockReturnValue({ select })
  return { select, eq }
}

function betForm(amount: string) {
  const form = new FormData()
  form.set('outcome_id', 'outcome-1')
  form.set('amount', amount)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
})

describe('placeBetAction', () => {
  it("turns a balance-check violation into the friendly copy with the member's current balance", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const { select, eq } = stubBalance(40)

    const state = await placeBetAction('market-1', undefined, betForm('500'))

    expect(state).toEqual({ formError: 'Insufficient balance — you have 40 DC. Try a smaller amount.' })
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('balance')
    expect(eq).toHaveBeenCalledWith('id', 'member-1')
  })

  it('falls back to the raw error message when the balance read finds no row', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: null, error: null }) }))
    supabase.from.mockReturnValue({ select: () => ({ eq }) })

    const state = await placeBetAction('market-1', undefined, betForm('500'))

    expect(state).toEqual({ formError: BALANCE_VIOLATION.message })
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'market is not open for betting' } })

    const state = await placeBetAction('market-1', undefined, betForm('5'))

    expect(state).toEqual({ formError: 'market is not open for betting' })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
