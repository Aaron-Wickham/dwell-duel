// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskRow } from '@/components/tasks/task-row'
import { CommitHistory } from './commit-history'

const { submitTaskCompletionAction } = vi.hoisted(() => ({ submitTaskCompletionAction: vi.fn() }))
vi.mock('@/lib/tasks/submit-task-completion', () => ({ submitTaskCompletionAction }))

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { SubmitButton } from '@/app/(app)/tasks/submit-button'

beforeEach(() => {
  submitTaskCompletionAction.mockReset()
  success.mockReset()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function countPendingChips(text: string): number {
  return text.split('Pending review').length - 1
}

describe('SubmitButton (tasks)', () => {
  it('shows Pending review the moment it is pressed, before the server answers', async () => {
    const answer = deferred<undefined>()
    submitTaskCompletionAction.mockReturnValue(answer.promise)
    render(<SubmitButton taskId="t1" />)

    await userEvent.click(screen.getByRole('button', { name: 'I did this' }))

    expect(submitTaskCompletionAction).toHaveBeenCalledWith('t1', undefined, expect.any(FormData))
    expect(screen.getByText('Pending review')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I did this' })).toBeNull()
    expect(success).not.toHaveBeenCalled()

    await act(async () => answer.resolve(undefined))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Submitted for review.'))
  })

  it('puts the button back, with the error, when the submission fails', async () => {
    const answer = deferred<{ formError: string }>()
    submitTaskCompletionAction.mockReturnValue(answer.promise)
    render(<SubmitButton taskId="t1" />)

    await userEvent.click(screen.getByRole('button', { name: 'I did this' }))
    expect(screen.getByText('Pending review')).toBeInTheDocument()

    await act(async () => answer.resolve({ formError: 'Already submitted this period.' }))

    expect(screen.queryByText('Pending review')).toBeNull()
    const button = screen.getByRole('button', { name: 'I did this' })
    expect(screen.getByRole('alert')).toHaveTextContent('Already submitted this period.')
    expect(button).toHaveAttribute('aria-describedby', 'submit-error-t1')
    expect(button).toHaveAccessibleDescription('Already submitted this period.')
    expect(success).not.toHaveBeenCalled()
  })

  it('never shows two Pending review chips for one task while the server state lands', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function TasksPage() {
      const [pending, setPending] = useState(false)
      submitTaskCompletionAction.mockImplementation(async () => {
        await answer.promise
        // Next applies the action's refreshed server props in a transition, like this one.
        startTransition(() => setPending(true))
        return undefined
      })
      return (
        <ul>
          <TaskRow
            title="Read Psalm 23"
            rewardAmount={5}
            description={`Server says ${pending ? 'pending' : 'available'}`}
            state={pending ? { kind: 'pending' } : { kind: 'available' }}
            action={<SubmitButton taskId="t1" />}
          />
        </ul>
      )
    }

    render(
      <CommitHistory history={history}>
        <TasksPage />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'I did this' }))
    expect(screen.getByText('Server says available')).toBeInTheDocument()
    expect(screen.getAllByText('Pending review')).toHaveLength(1)

    // Not inside act(): React commits the rest in separate tasks, as in a browser.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server says pending')).toBeInTheDocument())

    expect(screen.getAllByText('Pending review')).toHaveLength(1)
    expect(success).toHaveBeenCalledWith('Submitted for review.')
    expect(history.length).toBeGreaterThan(1)
    for (const text of history.slice(1)) expect(countPendingChips(text)).toBe(1)
  })
})
