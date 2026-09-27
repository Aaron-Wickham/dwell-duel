import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, update, eq } = vi.hoisted(() => {
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  return { update, eq, supabase: { from: vi.fn(() => ({ update })) } }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateTaskAction } from '@/lib/tasks/update-task'

function taskForm(title: string, description = '') {
  const form = new FormData()
  form.set('title', title)
  form.set('description', description)
  form.set('reward_amount', '10')
  form.set('is_active', 'on')
  return form
}

beforeEach(() => {
  supabase.from.mockClear()
  update.mockClear()
  eq.mockReset()
  eq.mockResolvedValue({ error: null })
})

describe('updateTaskAction length limits', () => {
  it('refuses a title over 120 characters without writing anything', async () => {
    const state = await updateTaskAction('t1', undefined, taskForm('a'.repeat(121)))

    expect(state).toEqual({ formError: 'Title can be at most 120 characters.', field: 'title' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses a description over 1000 characters without writing anything', async () => {
    const state = await updateTaskAction('t1', undefined, taskForm('Read Genesis 1-3', 'd'.repeat(1001)))

    expect(state).toEqual({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('saves a title and description exactly at their limits', async () => {
    const title = 'a'.repeat(120)
    const description = 'd'.repeat(1000)

    const state = await updateTaskAction('t1', undefined, taskForm(title, description))

    expect(state).toBeUndefined()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title, description }))
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })

  it('accepts a description of exactly 1000 characters once its CRLF line breaks are normalised', async () => {
    // A submitted textarea turns each newline into CRLF, so this is 1001 raw characters —
    // over the limit unless the pair is counted as the one line break it represents.
    const description = `${'d'.repeat(998)}\r\n${'d'}`

    const state = await updateTaskAction('t1', undefined, taskForm('Read Genesis 1-3', description))

    expect(state).toBeUndefined()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ description: `${'d'.repeat(998)}\n${'d'}` }))
  })
})
