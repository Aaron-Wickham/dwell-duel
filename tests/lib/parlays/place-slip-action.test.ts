import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpc, from, readSlip, writeSlip, revalidatePath, userHolder } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  readSlip: vi.fn(),
  writeSlip: vi.fn(),
  revalidatePath: vi.fn(),
  userHolder: { current: { id: 'member-1' } as { id: string } | null },
}))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: { rpc, from }, user: userHolder.current }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/parlays/slip', () => ({ readSlip, writeSlip }))

import { placeSlipAction } from '@/lib/parlays/place-slip'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'

function form(fields: [string, string][]): FormData {
  const data = new FormData()
  for (const [k, v] of fields) data.append(k, v)
  return data
}

beforeEach(() => {
  for (const fn of [rpc, from, readSlip, writeSlip, revalidatePath]) fn.mockReset()
  userHolder.current = { id: 'member-1' }
  readSlip.mockResolvedValue([A, B, C].map((outcomeId) => ({ outcomeId, parlay: false })))
})

describe('placeSlipAction', () => {
  it('passes the attempt key through, so a retry after a lost response places nothing twice', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const key = '11111111-2222-4333-8444-555555555555'
    await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '3'], ['idempotency_key', key]]))
    expect(rpc).toHaveBeenCalledWith('place_slip_v2', expect.objectContaining({ p_idempotency_key: key }))
  })

  it('ignores an attempt key that isn\'t a uuid', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '3'], ['idempotency_key', 'nope']]))
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBeUndefined()
  })

  it('sends solo stakes and the parlay legs to place_slip_v2, then empties the slip', async () => {
    rpc.mockResolvedValue({ data: { parlay_id: 'parlay-1', solos: 1, picks: [A, B, C], replayed: false }, error: null })
    from.mockReturnValue({
      select: () => ({ eq: async () => ({ data: [{ locked_odds: '2.0000' }, { locked_odds: '3.0000' }] }) }),
    })

    const result = await placeSlipAction(
      undefined,
      form([
        ['pick', `${A}:solo`],
        ['stake:' + A, '10'],
        ['pick', `${B}:parlay`],
        ['pick', `${C}:parlay`],
        ['parlay_stake', '5'],
      ]),
    )

    expect(rpc).toHaveBeenCalledWith('place_slip_v2', {
      p_singles: [{ outcome_id: A, amount: 10 }],
      p_parlay_outcome_ids: [B, C],
      p_parlay_stake: 5,
    })
    expect(writeSlip).toHaveBeenCalledWith([])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(result).toEqual({ placed: { solos: 1, parlay: { legs: 2, multiplierBp: 60_000, potentialPayout: 30 } } })
  })

  it('on a replay, reports what the earlier attempt placed and keeps picks added since (#226)', async () => {
    readSlip.mockResolvedValue([A, B, C].map((outcomeId) => ({ outcomeId, parlay: false })))
    rpc.mockResolvedValue({ data: { parlay_id: null, solos: 1, picks: [A], replayed: true }, error: null })

    const result = await placeSlipAction(
      undefined,
      form([['pick', `${A}:solo`], ['stake:' + A, '3'], ['pick', `${B}:solo`], ['stake:' + B, '4']]),
    )

    expect(writeSlip).toHaveBeenCalledWith([B, C].map((outcomeId) => ({ outcomeId, parlay: false })))
    expect(result).toEqual({ placed: { solos: 1, parlay: null, replayed: true } })
  })

  it("on a replay of a key stored before 0072, which can't say what it placed, clears the slip", async () => {
    rpc.mockResolvedValue({ data: { parlay_id: null, replayed: true }, error: null })

    const result = await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '3']]))

    expect(writeSlip).toHaveBeenCalledWith([])
    expect(result).toEqual({ placed: { solos: 0, parlay: null, replayed: true } })
  })

  it('flags each solo pick with a missing or bad stake, and a one-pick parlay, without calling the database', async () => {
    const result = await placeSlipAction(
      undefined,
      form([
        ['pick', `${A}:solo`],
        ['stake:' + A, '2.5'],
        ['pick', `${B}:solo`],
        ['pick', `${C}:parlay`],
      ]),
    )
    expect(result).toEqual({
      pickErrors: { [A]: 'Enter a whole number of DC greater than 0.', [B]: 'Enter a whole number of DC greater than 0.' },
      parlayError: 'A parlay needs at least 2 picks. Add another, or switch this one to Solo.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ignores picks that are no longer in the slip cookie', async () => {
    readSlip.mockResolvedValue([{ outcomeId: A, parlay: false }])
    rpc.mockResolvedValue({ data: null, error: null })

    await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '3'], ['pick', `${B}:solo`], ['stake:' + B, '3']]))
    expect(rpc).toHaveBeenCalledWith('place_slip_v2', { p_singles: [{ outcome_id: A, amount: 3 }], p_parlay_outcome_ids: [], p_parlay_stake: 0 })
  })

  it("points a database failure at the pick it names, and keeps the slip", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: `pick ${A}: market is not open for betting` } })

    const result = await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '3']]))
    expect(result).toEqual({ pickErrors: { [A]: 'Market is not open for betting.' } })
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('logs an unexpected database error and shows generic copy, not its text (#256)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: 'This operation was aborted' } })

    const result = await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '3']]))
    expect(result).toEqual({ formError: 'Something went wrong. Try again.' })
    expect(log).toHaveBeenCalled()
  })

  it('reports a balance shortfall with the current balance', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'new row violates check constraint "profiles_balance_check"' } })
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { balance: 7 } }) }) }) })

    const result = await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '30']]))
    expect(result).toEqual({ formError: 'Insufficient balance — you have 7 DC. Try a smaller amount.' })
  })

  it('refuses an empty slip and a signed-out member', async () => {
    expect(await placeSlipAction(undefined, form([]))).toEqual({ formError: 'Your slip is empty.' })
    userHolder.current = null
    expect(await placeSlipAction(undefined, form([['pick', `${A}:solo`]]))).toEqual({ formError: 'Not signed in.' })
  })
})
