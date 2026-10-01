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

describe('createTaskAction database errors', () => {
  it('says only an admin can create tasks when RLS refuses the insert', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy for table "tasks"' } })

    const state = await createTaskAction(undefined, taskForm('Read Genesis 1-3'))

    expect(state).toEqual({ formError: 'Only an admin can create or edit tasks.' })
  })

  it('rewords the reward cap constraint', async () => {
    insert.mockResolvedValue({
      error: { code: '23514', message: 'new row for relation "tasks" violates check constraint "tasks_reward_amount_max"' },
    })

    const state = await createTaskAction(undefined, taskForm('Read Genesis 1-3'))

    expect(state).toEqual({ formError: 'A task can reward at most 500 DC.', field: 'reward_amount' })
  })

  it('hides an unknown error behind a generic message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    insert.mockResolvedValue({ error: { code: 'XX000', message: 'internal error' } })

    const state = await createTaskAction(undefined, taskForm('Read Genesis 1-3'))

    expect(state).toEqual({ formError: 'Something went wrong. Try again.' })
    log.mockRestore()
  })
})

describe('createTaskAction attempt key (#258)', () => {
  const KEY = '3f0c1d52-6a52-4a0e-9a0b-0c5f3a9a4b11'

  it('stores the key, and treats a repeat of it as the success it already was', async () => {
    const form = taskForm('Read Genesis 1-3')
    form.set('idempotency_key', KEY)
    await createTaskAction(undefined, form)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ attempt_key: KEY }))

    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "tasks_attempt_key_idx"' } })
    expect(await createTaskAction(undefined, form)).toBeUndefined()
  })
})
