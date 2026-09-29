import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { submitTaskCompletionAction } from '@/lib/tasks/submit-task-completion'

function submission(fields: { note?: string; attachments?: string } = {}) {
  const form = new FormData()
  if (fields.note !== undefined) form.set('note', fields.note)
  if (fields.attachments !== undefined) form.set('attachments', fields.attachments)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockResolvedValue({ data: null, error: null })
  revalidatePath.mockReset()
})

describe('submitTaskCompletionAction', () => {
  it('sends the task, the trimmed note and the parsed attachments, then refreshes /tasks', async () => {
    const attachments = [
      { kind: 'link', url: 'https://example.com/notes' },
      { kind: 'photo', path: 'task/member-1/a.jpg', name: 'a.jpg' },
    ]

    const state = await submitTaskCompletionAction(
      'task-1',
      undefined,
      submission({ note: '  Read it with my small group\r\nTwice  ', attachments: JSON.stringify(attachments) }),
    )

    expect(state).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('submit_task_completion', {
      p_task_id: 'task-1',
      p_note: 'Read it with my small group\nTwice',
      p_attachments: attachments,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/tasks')
  })

  it('leaves out a blank note and sends no attachments when none came', async () => {
    await submitTaskCompletionAction('task-1', undefined, submission({ note: '   ' }))

    expect(supabase.rpc).toHaveBeenCalledWith('submit_task_completion', {
      p_task_id: 'task-1',
      p_note: undefined,
      p_attachments: [],
    })
  })

  it('treats an empty attachments field as none', async () => {
    await submitTaskCompletionAction('task-1', undefined, submission({ attachments: '' }))

    expect(supabase.rpc).toHaveBeenCalledWith('submit_task_completion', expect.objectContaining({ p_attachments: [] }))
  })

  it('refuses malformed attachment JSON without calling the database', async () => {
    const state = await submitTaskCompletionAction('task-1', undefined, submission({ attachments: '[{"kind":' }))

    expect(state).toEqual({ formError: 'Your attachments didn’t come through. Try again.' })
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a note over 500 characters without calling the database', async () => {
    const state = await submitTaskCompletionAction('task-1', undefined, submission({ note: 'n'.repeat(501) }))

    expect(state).toEqual({ formError: 'Note can be at most 500 characters.', field: 'note' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('counts the note after trimming and folding CRLF, so 500 characters still go through', async () => {
    const note = `${'n'.repeat(249)}\r\n${'n'.repeat(250)}`
    const state = await submitTaskCompletionAction('task-1', undefined, submission({ note: `  ${note}  ` }))

    expect(state).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith(
      'submit_task_completion',
      expect.objectContaining({ p_note: note.replace('\r\n', '\n') }),
    )
  })

  it('turns a database error into a sentence, and doesn’t refresh', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'this task needs proof' } })

    const state = await submitTaskCompletionAction('task-1', undefined, submission())

    expect(state).toEqual({ formError: 'This task needs proof.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
