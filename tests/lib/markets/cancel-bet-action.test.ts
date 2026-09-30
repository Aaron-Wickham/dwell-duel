import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpc, revalidatePath, userHolder } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  userHolder: { current: { id: 'member-1' } as { id: string } | null },
}))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: { rpc }, user: userHolder.current }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { cancelBetAction } from '@/lib/markets/cancel-bet'
import { GENERIC_ERROR } from '@/lib/errors/friendly-error'

beforeEach(() => {
  rpc.mockReset()
  revalidatePath.mockReset()
  userHolder.current = { id: 'member-1' }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cancelBetAction', () => {
  it('cancels the bet and refreshes the layout', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await cancelBetAction(7, undefined, new FormData())).toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('cancel_bet', { p_bet_id: 7 })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('refreshes the page on a refusal too, since it usually means the page was stale (#221)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'bet not found' } })
    expect(await cancelBetAction(7, undefined, new FormData())).toEqual({
      formError: 'This bet is no longer here. It may already have been cancelled.',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('puts a closed market in plain words', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'this market has closed, so the bet can no longer be cancelled' } })
    expect(await cancelBetAction(7, undefined, new FormData())).toEqual({
      formError: 'This market has closed, so the bet can no longer be cancelled.',
    })
  })

  it('hides an unknown database error behind the generic message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "public.bets" does not exist' } })
    expect(await cancelBetAction(7, undefined, new FormData())).toEqual({ formError: GENERIC_ERROR })
    expect(console.error).toHaveBeenCalled()
  })

  it('refuses a signed-out member without touching the database', async () => {
    userHolder.current = null
    expect(await cancelBetAction(7, undefined, new FormData())).toEqual({ formError: 'Not signed in.' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
