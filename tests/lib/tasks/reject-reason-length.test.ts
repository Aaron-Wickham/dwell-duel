import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { rejectTaskCompletionAction, bulkRejectTaskCompletionsAction } from '@/lib/tasks/review-task-completion'

function reasonForm(reason: string, ids: string[] = []) {
  const form = new FormData()
  form.set('reason', reason)
  for (const id of ids) form.append('completionIds', id)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('rejectTaskCompletionAction reason limit', () => {
  it('refuses a reason over 500 characters without rejecting anything', async () => {
    const state = await rejectTaskCompletionAction('c-1', undefined, reasonForm('r'.repeat(501)))

    expect(state).toEqual({ formError: 'Reason can be at most 500 characters.', field: 'reason' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects with a reason of exactly 500 characters, measured after trimming', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const state = await rejectTaskCompletionAction('c-1', undefined, reasonForm(`  ${'r'.repeat(500)}  `))

    expect(state).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('reject_task_completion', { p_completion_id: 'c-1', p_reason: 'r'.repeat(500) })
  })
})

describe('bulkRejectTaskCompletionsAction reason limit', () => {
  it('refuses a shared reason over 500 characters without rejecting anything', async () => {
    const state = await bulkRejectTaskCompletionsAction(undefined, reasonForm('r'.repeat(501), ['c-1', 'c-2']))

    expect(state).toEqual({ formError: 'Reason can be at most 500 characters.', field: 'reason' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects the selection with a shared reason of exactly 500 characters', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'c-1', ok: true, error: null }], error: null })

    const state = await bulkRejectTaskCompletionsAction(undefined, reasonForm('r'.repeat(500), ['c-1']))

    expect(state).toEqual({ summary: '1 rejected.' })
    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', {
      p_ids: ['c-1'],
      p_approve: false,
      p_note: 'r'.repeat(500),
    })
  })
})
