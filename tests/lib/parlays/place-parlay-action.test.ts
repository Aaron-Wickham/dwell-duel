import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, writeSlip } = vi.hoisted(() => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
  writeSlip: vi.fn(),
}))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/parlays/slip', () => ({ readSlip: async () => ['outcome-1', 'outcome-2'], writeSlip }))
vi.mock('@/lib/parlays/get-slip', () => ({
  getSlipView: async () => ({ picks: [{ outcomeId: 'outcome-1' }, { outcomeId: 'outcome-2' }] }),
}))

import { placeParlayAction } from '@/lib/parlays/place-parlay'

const BALANCE_VIOLATION = {
  code: '23514',
  message: 'new row for relation "profiles" violates check constraint "profiles_balance_check"',
}

function stubBalance(balance: number) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: { balance }, error: null }) }))
  supabase.from.mockReturnValue({ select: () => ({ eq }) })
  return eq
}

function stakeForm(stake: string) {
  const form = new FormData()
  form.set('stake', stake)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
  writeSlip.mockReset()
})

describe('placeParlayAction', () => {
  it("turns a balance-check violation into the friendly copy with the member's current balance, keeping the slip", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: BALANCE_VIOLATION })
    const eq = stubBalance(12)

    const state = await placeParlayAction(undefined, stakeForm('50'))

    expect(state).toEqual({ formError: 'Insufficient balance — you have 12 DC. Try a smaller amount.' })
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'member-1')
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: "'Market A' is no longer open" } })

    const state = await placeParlayAction(undefined, stakeForm('5'))

    expect(state).toEqual({ formError: "'Market A' is no longer open" })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
