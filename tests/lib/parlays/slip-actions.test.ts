import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, readSlip, writeSlip, revalidatePath, userHolder } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  readSlip: vi.fn(),
  writeSlip: vi.fn(),
  revalidatePath: vi.fn(),
  userHolder: { current: { id: 'member-1' } as { id: string } | null },
}))
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase, user: userHolder.current }),
}))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/parlays/slip', () => ({ readSlip, writeSlip }))

import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'

function outcomesTable(rows: { id: string; market_id: string }[]) {
  const inFn = vi.fn(async () => ({ data: rows, error: null }))
  const select = vi.fn(() => ({ in: inFn }))
  supabase.from.mockReturnValue({ select })
  return { select, in: inFn }
}

beforeEach(() => {
  supabase.from.mockReset()
  readSlip.mockReset()
  writeSlip.mockReset()
  revalidatePath.mockReset()
  userHolder.current = { id: 'member-1' }
})

describe('addToSlipAction', () => {
  it('returns false and makes no change when there is no signed-in user', async () => {
    userHolder.current = null
    readSlip.mockResolvedValue([])

    const result = await addToSlipAction('o1', new FormData())

    expect(result).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns false when the outcome is already in the slip', async () => {
    readSlip.mockResolvedValue(['o1'])

    const result = await addToSlipAction('o1', new FormData())

    expect(result).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('returns false for an unknown outcome id', async () => {
    readSlip.mockResolvedValue([])
    outcomesTable([])

    const result = await addToSlipAction('does-not-exist', new FormData())

    expect(result).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('returns false when the slip is already full', async () => {
    const slip = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6']
    readSlip.mockResolvedValue(slip)
    outcomesTable([
      ...slip.map((id, i) => ({ id, market_id: `m${i}` })),
      { id: 'o7', market_id: 'm7' },
    ])

    const result = await addToSlipAction('o7', new FormData())

    expect(result).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('returns true, writes the slip and revalidates when the pick is added', async () => {
    readSlip.mockResolvedValue(['o1'])
    outcomesTable([
      { id: 'o1', market_id: 'm1' },
      { id: 'o2', market_id: 'm2' },
    ])

    const result = await addToSlipAction('o2', new FormData())

    expect(result).toBe(true)
    expect(writeSlip).toHaveBeenCalledWith(['o1', 'o2'])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})

describe('removeFromSlipAction', () => {
  it('returns false and makes no change when the pick is not in the slip', async () => {
    readSlip.mockResolvedValue(['o1'])

    const result = await removeFromSlipAction('o2', new FormData())

    expect(result).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns true, writes the slip and revalidates when the pick is removed', async () => {
    readSlip.mockResolvedValue(['o1', 'o2'])

    const result = await removeFromSlipAction('o1', new FormData())

    expect(result).toBe(true)
    expect(writeSlip).toHaveBeenCalledWith(['o2'])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
