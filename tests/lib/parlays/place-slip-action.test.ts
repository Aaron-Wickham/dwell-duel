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

// What the action reads back for a placed parlay: its fixed figures (0104).
function parlayRow(row: Record<string, unknown>) {
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) })
}

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
    expect(rpc).toHaveBeenCalledWith('place_slip_v4', expect.objectContaining({ p_idempotency_key: key }))
  })

  it('ignores an attempt key that isn\'t a uuid', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '3'], ['idempotency_key', 'nope']]))
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBeUndefined()
  })

  it('sends solo stakes and the parlay legs to place_slip_v4, then empties the slip', async () => {
    parlayRow({ multiplier: 6, payout: 30, parlay_legs: [{ outcome_id: B }, { outcome_id: C }] })
    rpc.mockResolvedValue({ data: { parlay_id: 'parlay-1', solos: 1, picks: [A, B, C], replayed: false }, error: null })

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

    expect(rpc).toHaveBeenCalledWith('place_slip_v4', {
      p_singles: [{ outcome_id: A, amount: 10 }],
      p_parlay_outcome_ids: [B, C],
      p_parlay_stake: 5,
    })
    expect(writeSlip).toHaveBeenCalledWith([])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(result).toEqual({ placed: { solos: 1, parlay: { legs: 2, multiplierBp: 60_000, potentialPayout: 30 } } })
  })

  // Only a replay of an attempt from before 0104 can find a parlay without fixed figures.
  it('names no parlay when the one placed has no fixed payout', async () => {
    parlayRow({ multiplier: null, payout: null, parlay_legs: [{ outcome_id: B }, { outcome_id: C }] })
    rpc.mockResolvedValue({ data: { parlay_id: 'parlay-1', solos: 0, picks: [B, C], replayed: true }, error: null })
    const result = await placeSlipAction(undefined, form([['pick', `${B}:parlay`], ['pick', `${C}:parlay`], ['parlay_stake', '5']]))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ placed: { solos: 0, parlay: null, replayed: true } })
  })

  it('sends the payout the slip showed for a parlay on lmsr markets, and reports its fixed figures (0104)', async () => {
    parlayRow({ multiplier: 5.2401, payout: 52, parlay_legs: [{ outcome_id: B }, { outcome_id: C }] })
    rpc.mockResolvedValue({ data: { parlay_id: 'parlay-1', solos: 0, picks: [B, C], replayed: false }, error: null })
    const result = await placeSlipAction(
      undefined,
      form([['pick', `${B}:parlay`], ['pick', `${C}:parlay`], ['parlay_stake', '10'], ['parlay_payout', '52']]),
    )
    expect(rpc).toHaveBeenCalledWith('place_slip_v4', {
      p_singles: [],
      p_parlay_outcome_ids: [B, C],
      p_parlay_stake: 10,
      p_parlay_payout: 52,
    })
    expect(result).toEqual({ placed: { solos: 0, parlay: { legs: 2, multiplierBp: 52_401, potentialPayout: 52 } } })
  })

  it('on a moved parlay price, says what it pays now, and remembers the stake it was refused at', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'parlay: price_moved:47' } })
    const result = await placeSlipAction(
      undefined,
      form([['pick', `${B}:parlay`], ['pick', `${C}:parlay`], ['parlay_stake', '10'], ['parlay_payout', '52']]),
    )
    expect(result).toEqual({
      parlayError: 'The price moved, so this parlay now pays 47 DC if every pick wins. Tap Place again to bet at the new price.',
      priceMoved: true,
      movedStakes: { parlay: '10' },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('sends the payout the slip showed for a pick on an lmsr market (0102)', async () => {
    rpc.mockResolvedValue({ data: { parlay_id: null, solos: 2, picks: [A, B], replayed: false }, error: null })
    await placeSlipAction(
      undefined,
      form([
        ['pick', `${A}:solo`],
        ['stake:' + A, '10'],
        ['payout:' + A, '18'],
        ['pick', `${B}:solo`],
        ['stake:' + B, '4'],
      ]),
    )
    expect(rpc).toHaveBeenCalledWith('place_slip_v4', {
      p_singles: [
        { outcome_id: A, amount: 10, payout: 18 },
        { outcome_id: B, amount: 4 },
      ],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
    })
  })

  it('on a moved price, says what the pick pays now and refreshes the slip so Place sends the new figure', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: `pick ${A}: price_moved:17` } })
    const result = await placeSlipAction(undefined, form([['pick', `${A}:solo`], ['stake:' + A, '10'], ['payout:' + A, '18']]))
    expect(result).toEqual({
      pickErrors: { [A]: 'The price moved, so this bet now pays 17 DC if it wins. Tap Place again to bet at the new price.' },
      priceMoved: true,
      movedStakes: { [A]: '10' },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(writeSlip).not.toHaveBeenCalled()
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
    expect(rpc).toHaveBeenCalledWith('place_slip_v4', { p_singles: [{ outcome_id: A, amount: 3 }], p_parlay_outcome_ids: [], p_parlay_stake: 0 })
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
