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

import { addToSlipAction, removeFromSlipAction, setPickModeAction } from '@/lib/parlays/slip-actions'

const solo = (outcomeId: string) => ({ outcomeId, parlay: false })
const leg = (outcomeId: string) => ({ outcomeId, parlay: true })

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

    expect(await addToSlipAction('o1', new FormData())).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns false when the outcome is already in the slip', async () => {
    readSlip.mockResolvedValue([solo('o1')])

    expect(await addToSlipAction('o1', new FormData())).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('returns false for an unknown outcome id', async () => {
    readSlip.mockResolvedValue([])
    outcomesTable([])

    expect(await addToSlipAction('does-not-exist', new FormData())).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('returns false when the slip is already full', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `o${i}`)
    readSlip.mockResolvedValue(ids.map(solo))
    outcomesTable([...ids.map((id, i) => ({ id, market_id: `m${i}` })), { id: 'o99', market_id: 'm99' }])

    expect(await addToSlipAction('o99', new FormData())).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
  })

  it('adds the pick as Solo, keeping the others and their modes, and revalidates', async () => {
    readSlip.mockResolvedValue([leg('o1')])
    outcomesTable([
      { id: 'o1', market_id: 'm1' },
      { id: 'o2', market_id: 'm2' },
    ])

    expect(await addToSlipAction('o2', new FormData())).toBe(true)
    expect(writeSlip).toHaveBeenCalledWith([leg('o1'), solo('o2')])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it("replaces the same market's pick", async () => {
    readSlip.mockResolvedValue([leg('o1'), solo('o2')])
    outcomesTable([
      { id: 'o1', market_id: 'm1' },
      { id: 'o2', market_id: 'm2' },
      { id: 'o3', market_id: 'm1' },
    ])

    expect(await addToSlipAction('o3', new FormData())).toBe(true)
    expect(writeSlip).toHaveBeenCalledWith([solo('o2'), solo('o3')])
  })
})

describe('removeFromSlipAction', () => {
  it('returns false and makes no change when the pick is not in the slip', async () => {
    readSlip.mockResolvedValue([solo('o1')])

    expect(await removeFromSlipAction('o2')).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns true, writes the slip and revalidates when the pick is removed', async () => {
    readSlip.mockResolvedValue([solo('o1'), leg('o2')])

    expect(await removeFromSlipAction('o1')).toBe(true)
    expect(writeSlip).toHaveBeenCalledWith([leg('o2')])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})

describe('setPickModeAction', () => {
  it("switches one pick's mode, leaving the rest", async () => {
    readSlip.mockResolvedValue([solo('o1'), solo('o2')])

    expect(await setPickModeAction('o2', true)).toBe(true)
    expect(writeSlip).toHaveBeenCalledWith([solo('o1'), leg('o2')])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('is a no-op for a pick not in the slip, or already in that mode', async () => {
    readSlip.mockResolvedValue([leg('o1')])

    expect(await setPickModeAction('o2', true)).toBe(false)
    expect(await setPickModeAction('o1', true)).toBe(false)
    expect(writeSlip).not.toHaveBeenCalled()
  })
})
