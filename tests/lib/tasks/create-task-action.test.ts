import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, insert } = vi.hoisted(() => {
  const insert = vi.fn()
  return { insert, supabase: { from: vi.fn(() => ({ insert })) } }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTaskAction } from '@/lib/tasks/create-task'

function taskForm(title: string, description = '') {
  const form = new FormData()
  form.set('title', title)
  form.set('description', description)
  form.set('reward_amount', '10')
  return form
}

beforeEach(() => {
  supabase.from.mockClear()
  insert.mockReset()
  insert.mockResolvedValue({ error: null })
})

describe('createTaskAction length limits', () => {
  it('refuses a title over 120 characters without writing anything', async () => {
    const state = await createTaskAction(undefined, taskForm('a'.repeat(121)))

    expect(state).toEqual({ formError: 'Title can be at most 120 characters.', field: 'title' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses a description over 1000 characters without writing anything', async () => {
    const state = await createTaskAction(undefined, taskForm('Read Genesis 1-3', 'd'.repeat(1001)))

    expect(state).toEqual({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('creates a task whose title and description are exactly at their limits, measured after trimming', async () => {
    const title = 'a'.repeat(120)
    const description = 'd'.repeat(1000)

    const state = await createTaskAction(undefined, taskForm(` ${title} `, ` ${description} `))

    expect(state).toBeUndefined()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ title, description }))
  })

  it('accepts a description of exactly 1000 characters once its CRLF line breaks are normalised', async () => {
    // A submitted textarea turns each newline into CRLF, so this is 1001 raw characters —
    // over the limit unless the pair is counted as the one line break it represents.
    const description = `${'d'.repeat(998)}\r\n${'d'}`

    const state = await createTaskAction(undefined, taskForm('Read Genesis 1-3', description))

    expect(state).toBeUndefined()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ description: `${'d'.repeat(998)}\n${'d'}` }))
  })
})
