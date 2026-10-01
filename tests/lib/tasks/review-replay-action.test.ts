import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const chain = { select: () => chain, eq: () => chain, maybeSingle }
  return { supabase: { rpc: vi.fn(), from: vi.fn(() => chain) }, revalidatePath: vi.fn(), maybeSingle }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'reviewer-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/push/notify', () => ({ afterAction: vi.fn(), notifyTaskReviews: vi.fn() }))

import { approveTaskCompletionAction, rejectTaskCompletionAction } from '@/lib/tasks/review-task-completion'

const NOT_PENDING = { code: 'P0001', message: 'completion is not pending' }

beforeEach(() => {
  supabase.rpc.mockReset()
  maybeSingle.mockReset()
  supabase.rpc.mockResolvedValue({ data: null, error: NOT_PENDING })
})

describe('single review replay', () => {
  it('counts a replayed approve as success when this reviewer approved it', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'approved', reviewed_by: 'reviewer-1' } })
    expect(await approveTaskCompletionAction('c-1', undefined, new FormData())).toBeUndefined()
  })

  it('counts a replayed reject as success when this reviewer rejected it', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'rejected', reviewed_by: 'reviewer-1' } })
    expect(await rejectTaskCompletionAction('c-1', undefined, new FormData())).toBeUndefined()
  })

  it('still says it was reviewed when someone else did, or the other way', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'approved', reviewed_by: 'someone-else' } })
    expect(await approveTaskCompletionAction('c-1', undefined, new FormData())).toEqual({ formError: 'This submission has already been reviewed.' })
    maybeSingle.mockResolvedValue({ data: { status: 'approved', reviewed_by: 'reviewer-1' } })
    expect(await rejectTaskCompletionAction('c-1', undefined, new FormData())).toEqual({ formError: 'This submission has already been reviewed.' })
  })
})
