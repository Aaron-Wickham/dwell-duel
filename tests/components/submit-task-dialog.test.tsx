// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskRow } from '@/components/tasks/task-row'
import { buttonVariants } from '@/components/ui/button'
import { CommitHistory } from './commit-history'

const { submitTaskCompletionAction, uploadProof, discardProof, success } = vi.hoisted(() => ({
  submitTaskCompletionAction: vi.fn(),
  uploadProof: vi.fn(),
  discardProof: vi.fn(),
  success: vi.fn(),
}))
vi.mock('@/lib/tasks/submit-task-completion', () => ({ submitTaskCompletionAction }))
vi.mock('@/lib/proof/upload', () => ({ uploadProof, discardProof }))
vi.mock('sonner', () => ({ toast: { success } }))

import { SubmitTaskDialog } from '@/app/(app)/tasks/submit-task-dialog'

beforeEach(() => {
  for (const fn of [submitTaskCompletionAction, uploadProof, discardProof, success]) fn.mockReset()
  uploadProof.mockImplementation(async (drafts: { kind: string; url?: string }[]) =>
    drafts.map((d) => (d.kind === 'link' ? { kind: 'link', url: d.url } : { kind: d.kind, storage_path: 'task/m1/x/a.jpg', file_name: 'a.jpg', size_bytes: 1 })),
  )
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function renderDialog(proofRequired = false) {
  return render(<SubmitTaskDialog taskId="t1" taskTitle="Read Psalm 23" memberId="m1" proofRequired={proofRequired} />)
}

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'I did this, Read Psalm 23' }))
  return screen.findByRole('dialog', { name: 'Submit “Read Psalm 23”' })
}

describe('SubmitTaskDialog', () => {
  // #394: one per row, so a primary button on each made twenty equal calls to action.
  it('opens from a secondary button, labelled Try again after a rejection', () => {
    render(<SubmitTaskDialog taskId="t1" taskTitle="Read Psalm 23" memberId="m1" proofRequired={false} label="Try again" />)
    const trigger = screen.getByRole('button', { name: 'Try again, Read Psalm 23' })
    expect(trigger.className).toBe(buttonVariants({ variant: 'secondary', size: 'sm' }))
  })

  it('sends the note and the uploaded proof, then says it was sent before the server answers', async () => {
    const answer = deferred<undefined>()
    submitTaskCompletionAction.mockReturnValue(answer.promise)
    renderDialog()
    await openDialog()

    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Read it at breakfast')
    await userEvent.type(screen.getByLabelText('Link'), 'https://example.com/notes')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(submitTaskCompletionAction).toHaveBeenCalled())
    expect(uploadProof).toHaveBeenCalledWith(
      [expect.objectContaining({ kind: 'link', url: 'https://example.com/notes' })],
      'task/m1/',
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    const formData = submitTaskCompletionAction.mock.calls[0][2] as FormData
    expect(formData.get('note')).toBe('Read it at breakfast')
    expect(JSON.parse(String(formData.get('attachments')))).toEqual([{ kind: 'link', url: 'https://example.com/notes' }])
    expect(await screen.findByText('Sent for review')).toBeInTheDocument()

    await act(async () => answer.resolve(undefined))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Submitted for review.'))
  })

  it('hands focus to the page heading once "Sent for review" replaces the trigger, instead of dropping it on <body>', async () => {
    const answer = deferred<undefined>()
    submitTaskCompletionAction.mockReturnValue(answer.promise)
    render(
      <>
        <h1>Tasks</h1>
        <SubmitTaskDialog taskId="t1" taskTitle="Read Psalm 23" memberId="m1" proofRequired={false} />
      </>,
    )
    await openDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('Sent for review')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
    expect(screen.queryByRole('button', { name: /I did this/ })).toBeNull()

    await act(async () => answer.resolve(undefined))
  })

  it('refuses a proof-required task with no proof, without uploading or submitting', async () => {
    renderDialog(true)
    const dialog = await openDialog()
    expect(dialog).toHaveTextContent('This task needs proof')
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This task needs proof: add a photo, file or link.')
    expect(uploadProof).not.toHaveBeenCalled()
    expect(submitTaskCompletionAction).not.toHaveBeenCalled()
  })

  it('removes the uploaded files again, and keeps the dialog open with the error, when the submission fails', async () => {
    submitTaskCompletionAction.mockResolvedValue({ formError: 'You already have a pending submission.' })
    renderDialog()
    await openDialog()
    await userEvent.type(screen.getByLabelText('Link'), 'https://example.com/a')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a pending submission.')
    expect(discardProof).toHaveBeenCalledWith([{ kind: 'link', url: 'https://example.com/a' }])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(success).not.toHaveBeenCalled()
  })

  it('refuses a link that isn’t a web address', async () => {
    renderDialog()
    await openDialog()
    await userEvent.type(screen.getByLabelText('Link'), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Links must start with http:// or https://.')
    expect(screen.queryByRole('list', { name: 'Attached proof' })).not.toBeInTheDocument()
  })

  // TSK-1, TSK-9: the row clamps the instructions to a line, so the dialog shows them whole.
  it('shows the task’s full instructions, and says proof can’t be deleted once sent', async () => {
    render(
      <SubmitTaskDialog
        taskId="t1"
        taskTitle="Read Psalm 23"
        description="Read it aloud, then write one verse from memory."
        memberId="m1"
        proofRequired={false}
      />,
    )
    const dialog = await openDialog()
    expect(dialog).toHaveTextContent('Read it aloud, then write one verse from memory.')
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining('Proof can’t be deleted once it’s sent.'))
  })

  // TSK-2: a link typed but never added with Add link is still what the member means to send.
  it('sends a good link still in the field, as if Add link had been tapped', async () => {
    submitTaskCompletionAction.mockResolvedValue(undefined)
    renderDialog(true)
    await openDialog()
    await userEvent.type(screen.getByLabelText('Link'), 'https://example.com/notes')
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(submitTaskCompletionAction).toHaveBeenCalled())
    const formData = submitTaskCompletionAction.mock.calls[0][2] as FormData
    expect(JSON.parse(String(formData.get('attachments')))).toEqual([{ kind: 'link', url: 'https://example.com/notes' }])
  })

  it('stops on a link in the field that can’t be sent, saying so on the field', async () => {
    renderDialog()
    await openDialog()
    const link = screen.getByLabelText('Link')
    await userEvent.type(link, 'example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(link).toHaveAttribute('aria-invalid', 'true'))
    expect(link).toHaveAccessibleDescription(expect.stringContaining('Add the link or clear it before sending.'))
    expect(link).toHaveFocus()
    expect(screen.getAllByText('Add the link or clear it before sending.')).toHaveLength(1)
    expect(uploadProof).not.toHaveBeenCalled()
    expect(submitTaskCompletionAction).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()

    await userEvent.clear(link)
    expect(link).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Add the link or clear it before sending.')).toBeNull()
  })

  // SYS-3: the button says which file is going up, then that it's sending.
  it('says which file is uploading, then that it’s sending', async () => {
    const uploads = deferred<void>()
    const answer = deferred<undefined>()
    uploadProof.mockImplementation(async (_drafts: unknown, _prefix: string, options?: { onProgress?: (c: number, t: number) => void }) => {
      // The real upload loads the Storage client first, so progress always follows an await.
      await Promise.resolve()
      options?.onProgress?.(1, 2)
      await uploads.promise
      return []
    })
    submitTaskCompletionAction.mockReturnValue(answer.promise)
    renderDialog()
    await openDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByText('Uploading 1 of 2…', { selector: '[role="status"]' })).toBeInTheDocument()
    await act(async () => uploads.resolve())
    await waitFor(() => expect(submitTaskCompletionAction).toHaveBeenCalled())
    await act(async () => answer.resolve(undefined))
  })

  it('never says a task is both sent and waiting while the server state lands', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function TasksPage() {
      const [pending, setPending] = useState(false)
      submitTaskCompletionAction.mockImplementation(async () => {
        await answer.promise
        startTransition(() => setPending(true))
        return undefined
      })
      return (
        <ul>
          <TaskRow
            title="Read Psalm 23"
            rewardAmount={5}
            description={null}
            cadence="once"
            state={pending ? { kind: 'waiting', sentAt: new Date().toISOString(), now: Date.now() } : { kind: 'todo' }}
            action={<SubmitTaskDialog taskId="t1" taskTitle="Read Psalm 23" memberId="m1" proofRequired={false} />}
          />
        </ul>
      )
    }

    render(
      <CommitHistory history={history}>
        <TasksPage />
      </CommitHistory>,
    )
    await openDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    await waitFor(() => expect(screen.getAllByText('Sent for review')).toHaveLength(1))

    answer.resolve()
    await waitFor(() => expect(screen.getByText('today')).toBeInTheDocument())
    expect(screen.queryByText('Sent for review')).toBeNull()
    for (const text of history) expect(text.includes('Sent for review') && text.includes('sent today')).toBe(false)
  })
})
