import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { bulkApproveTaskCompletionsAction, bulkRejectTaskCompletionsAction } from '@/lib/tasks/review-task-completion'

function selection(ids: string[], reason?: string) {
  const form = new FormData()
  for (const id of ids) form.append('completionIds', id)
  if (reason !== undefined) form.set('reason', reason)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  revalidatePath.mockReset()
})

describe('bulkApproveTaskCompletionsAction', () => {
  it('approves every selected completion in one call', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: true, error: null },
        { id: 'c-2', ok: true, error: null },
      ],
      error: null,
    })

    const state = await bulkApproveTaskCompletionsAction(undefined, selection(['c-2', 'c-1']))

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', { p_ids: ['c-2', 'c-1'], p_approve: true })
    expect(state).toEqual({ summary: '2 approved.' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('reports the ones that failed, with the first failure in id order', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: false, error: 'completion is not pending' },
        { id: 'c-2', ok: true, error: null },
        { id: 'c-3', ok: false, error: 'completion not found' },
      ],
      error: null,
    })

    const state = await bulkApproveTaskCompletionsAction(undefined, selection(['c-3', 'c-2', 'c-1']))

    expect(state).toEqual({ summary: '1 approved, 2 failed (completion is not pending).' })
  })

  it('fails every selected completion when the call itself fails', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'only an admin can review task completions' } })

    const state = await bulkApproveTaskCompletionsAction(undefined, selection(['c-1', 'c-2', 'c-3']))

    expect(state).toEqual({ summary: '0 approved, 3 failed (only an admin can review task completions).' })
  })

  it('asks for a selection before calling anything', async () => {
    const state = await bulkApproveTaskCompletionsAction(undefined, selection([]))

    expect(state).toEqual({ formError: 'Select at least one completion.' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

describe('bulkRejectTaskCompletionsAction', () => {
  it('rejects every selected completion in one call, with the reason as the note', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: true, error: null },
        { id: 'c-2', ok: true, error: null },
      ],
      error: null,
    })

    const state = await bulkRejectTaskCompletionsAction(undefined, selection(['c-1', 'c-2'], '  Photo is blurry  '))

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', {
      p_ids: ['c-1', 'c-2'],
      p_approve: false,
      p_note: 'Photo is blurry',
    })
    expect(state).toEqual({ summary: '2 rejected.' })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/tasks')
  })

  it('sends no note when the reason is blank', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'c-1', ok: true, error: null }], error: null })

    await bulkRejectTaskCompletionsAction(undefined, selection(['c-1'], '   '))

    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', { p_ids: ['c-1'], p_approve: false, p_note: undefined })
  })

  it('reports the ones that failed', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: true, error: null },
        { id: 'c-2', ok: false, error: 'completion is not pending' },
      ],
      error: null,
    })

    const state = await bulkRejectTaskCompletionsAction(undefined, selection(['c-1', 'c-2']))

    expect(state).toEqual({ summary: '1 rejected, 1 failed (completion is not pending).' })
  })

  it('fails every selected completion when the call itself fails', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'fetch failed' } })

    const state = await bulkRejectTaskCompletionsAction(undefined, selection(['c-1', 'c-2']))

    expect(state).toEqual({ summary: '0 rejected, 2 failed (fetch failed).' })
  })
})
