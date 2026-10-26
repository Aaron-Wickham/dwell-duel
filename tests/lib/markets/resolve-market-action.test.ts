import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const chain: Record<string, unknown> = { maybeSingle }
  for (const m of ['select', 'eq', 'is', 'limit']) chain[m] = () => chain
  return { supabase: { rpc: vi.fn(), from: vi.fn(() => chain) }, revalidatePath: vi.fn(), maybeSingle }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath, updateTag: vi.fn() }))

import { resolveMarketAction } from '@/lib/markets/resolve-market'
import { GENERIC_ERROR } from '@/lib/errors/friendly-error'

function outcomeForm(outcomeId: string, note = 'Final score 3–1') {
  const form = new FormData()
  form.set('outcome_id', outcomeId)
  form.set('note', note)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  revalidatePath.mockReset()
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null })
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
        'Can’t override: Bob has already spent 40 of 60\u00A0DC won on this market. Adjust their balances first if you still want to override.',
      field: 'outcome',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('logs an unexpected database error and shows generic copy, not its text (#256)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))

    expect(state).toEqual({ formError: 'That didn’t go through. Try again, and if it keeps happening, tell an admin.', field: 'outcome' })
    expect(log).toHaveBeenCalled()
  })

  it('words the same-outcome refusal for the admin (#198)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'that outcome is already the result' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))

    expect(state).toEqual({ formError: 'That outcome is already the result, so there’s nothing to override.', field: 'outcome' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  // MKT-4: each raise says what happened and what to do, pointing at the field it's about.
  it.each([
    ['only an admin can change an already-resolved market', 'This market already has a result. Only an admin can change it.', 'outcome'],
    ['market was voided', 'This market was called off, so it can’t be resolved.', 'outcome'],
    ['market has not closed yet', 'This market hasn’t closed yet. Resolve it once betting closes.', 'outcome'],
    [
      'you have a stake in this market, so someone else resolves it',
      'You have a stake in this market, so a reviewer or an admin resolves it.',
      'outcome',
    ],
    ['say why this outcome won', 'Say why this outcome won.', 'note'],
    ["the result can't equal the line", 'The result can’t equal the line. Check the number you entered.', 'outcome'],
    ["an attachment didn't finish uploading; try again", 'An attachment didn’t finish uploading. Try again.', 'outcome'],
  ])('words the refusal %j', async (message, formError, field) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-2'))

    expect(state).toEqual({ formError, field })
  })

  it('logs a refusal it has no words for and shows generic copy, not its text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'some new raise nobody mapped' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-2'))

    expect(state).toEqual({ formError: GENERIC_ERROR, field: 'outcome' })
    expect(log).toHaveBeenCalled()
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

  // A lost response replayed by Next: the first call resolved it, the replay is refused.
  it('treats a replay of the same member’s resolve to the same outcome as success', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'only an admin can change an already-resolved market' } })
    maybeSingle.mockResolvedValue({ data: { id: 'res-1' } })

    expect(await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))).toBeUndefined()

    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'that outcome is already the result' } })
    expect(await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))).toBeUndefined()
  })
})
