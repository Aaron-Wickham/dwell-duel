import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { resolveMarketAction } from '@/lib/markets/resolve-market'

function outcomeForm(outcomeId: string, note = 'Final score 3–1') {
  const form = new FormData()
  form.set('outcome_id', outcomeId)
  form.set('note', note)
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

    expect(supabase.rpc).toHaveBeenCalledWith('resolve_market', {
      p_market_id: 'market-1',
      p_outcome_id: 'outcome-2',
      p_note: 'Final score 3–1',
      p_attachments: [],
    })
    expect(state).toEqual({
      formError:
        'Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override.',
      field: 'outcome',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('logs an unexpected database error and shows generic copy, not its text (#256)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))

    expect(state).toEqual({ formError: 'Something went wrong. Try again.', field: 'outcome' })
    expect(log).toHaveBeenCalled()
  })

  it('words the same-outcome refusal for the admin (#198)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'that outcome is already the result' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))

    expect(state).toEqual({ formError: 'That outcome is already the result, so there’s nothing to override.', field: 'outcome' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'only an admin can change an already-resolved market' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-2'))

    expect(state).toEqual({ formError: 'only an admin can change an already-resolved market', field: 'outcome' })
  })

  it('requires a note saying why, without calling the database', async () => {
    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1', '   '))
    expect(state).toEqual({ formError: 'Say why this outcome won.', field: 'note' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('passes the attached proof records through', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    const form = outcomeForm('outcome-1')
    form.set('attachments', JSON.stringify([{ kind: 'link', url: 'https://example.com/replay' }]))
    await resolveMarketAction('market-1', undefined, form)
    expect(supabase.rpc).toHaveBeenCalledWith('resolve_market', expect.objectContaining({ p_attachments: [{ kind: 'link', url: 'https://example.com/replay' }] }))
  })

  it('refreshes the layout when the resolution goes through', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))

    expect(state).toBeUndefined()
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
