// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import type { PendingRow } from '@/app/(app)/admin/tasks/pending-approvals'

// React resets a form once its action finishes, even after an error (#63). Each form here keeps
// what the member typed when the server refuses it; the admin forms also toast on success (#65).

const actions = vi.hoisted(() => ({
  submitTaskCompletionAction: vi.fn(),
  updateMarketAction: vi.fn(),
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  updateProfileAction: vi.fn(),
  bulkApproveTaskCompletionsAction: vi.fn(),
  bulkRejectTaskCompletionsAction: vi.fn(),
  rejectTaskCompletionAction: vi.fn(),
}))
const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))
vi.mock('@/lib/tasks/submit-task-completion', () => ({ submitTaskCompletionAction: actions.submitTaskCompletionAction }))
vi.mock('@/lib/proof/upload', () => ({ uploadProof: async () => [], discardProof: async () => {} }))
vi.mock('@/lib/markets/update-market', () => ({ updateMarketAction: actions.updateMarketAction }))
vi.mock('@/lib/tasks/create-task', () => ({ createTaskAction: actions.createTaskAction }))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction: actions.updateTaskAction }))
vi.mock('@/lib/profile/update-profile', () => ({ updateProfileAction: actions.updateProfileAction }))
vi.mock('@/lib/tasks/review-task-completion', () => ({
  approveTaskCompletionAction: vi.fn(),
  rejectTaskCompletionAction: actions.rejectTaskCompletionAction,
  bulkApproveTaskCompletionsAction: actions.bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction: actions.bulkRejectTaskCompletionsAction,
}))

import { SubmitTaskDialog } from '@/app/(app)/tasks/submit-task-dialog'
import { EditMarketDialog } from '@/app/(app)/markets/[id]/edit-market-dialog'
import { CreateTaskForm } from '@/app/(app)/admin/tasks/create-task-form'
import { EditTaskForm } from '@/app/(app)/admin/tasks/edit-task-form'
import { TaskCatalogItem } from '@/app/(app)/admin/tasks/task-catalog-item'
import { ProfileForm } from '@/app/(app)/profile/profile-form'
import { PendingApprovals } from '@/app/(app)/admin/tasks/pending-approvals'
import { ReviewButtons } from '@/app/(app)/admin/tasks/review-buttons'

const GENESIS: TaskSummary = {
  id: 't1',
  title: 'Read Genesis 1-3',
  description: 'Before Sunday',
  rewardAmount: 10,
  isRepeatable: false,
  period: null,
  isActive: true,
  proofRequired: false,
}

function pendingRow(id: string, submitterId: string, submitterName: string): PendingRow {
  return {
    id,
    taskTitle: 'Read Genesis 1-3',
    submitterId,
    submitterName,
    rewardAmount: 10,
    submittedAt: '2026-09-25T09:00:00Z',
    submittedAge: '1h ago',
    note: null,
    proof: [],
  }
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset()
  success.mockReset()
})

describe('SubmitTaskDialog', () => {
  it('keeps the note after the submission fails', async () => {
    actions.submitTaskCompletionAction.mockResolvedValue({ formError: 'You already have a pending submission.' })
    render(<SubmitTaskDialog taskId="t1" taskTitle="Read Psalm 23" memberId="m1" proofRequired={false} />)
    await userEvent.click(screen.getByRole('button', { name: /^I did this/ }))
    await userEvent.type(await screen.findByLabelText('Note (optional)'), 'Read it at breakfast')
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Read it at breakfast')
  })
})

describe('EditMarketDialog', () => {
  it('keeps the edited title and description after the server refuses them', async () => {
    actions.updateMarketAction.mockResolvedValue({ formError: 'Market is closed.' })
    render(<EditMarketDialog marketId="m1" title="Will it snow?" description="Before noon" />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const title = await screen.findByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Will it snow on Sunday?')
    await userEvent.type(screen.getByLabelText('Description'), ' or after')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Title')).toHaveValue('Will it snow on Sunday?')
    expect(screen.getByLabelText('Description')).toHaveValue('Before noon or after')
  })

  it('starts from the market as it stands each time it opens, not from a cancelled edit', async () => {
    render(<EditMarketDialog marketId="m1" title="Will it snow?" description={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.type(await screen.findByLabelText('Title'), ' Maybe')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Will it snow?')
  })
})

describe('CreateTaskForm', () => {
  async function fillRepeatableTask() {
    await userEvent.type(screen.getByLabelText('Title'), 'Read Ruth')
    await userEvent.type(screen.getByLabelText('Description'), 'All four chapters')
    await userEvent.type(screen.getByLabelText('Reward (DC)'), '15')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Require proof' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Repeatable' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cadence' }), 'weekly')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))
  }

  it('keeps every field after the server refuses the task', async () => {
    actions.createTaskAction.mockResolvedValue({ formError: 'Could not create that task.' })
    render(<CreateTaskForm />)
    await fillRepeatableTask()

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Title')).toHaveValue('Read Ruth')
    expect(screen.getByLabelText('Description')).toHaveValue('All four chapters')
    expect(screen.getByLabelText('Reward (DC)')).toHaveValue(15)
    expect(screen.getByRole('checkbox', { name: 'Require proof' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Repeatable' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Cadence' })).toHaveValue('weekly')
    expect(success).not.toHaveBeenCalled()
  })

  it('toasts once the task is created, and starts the form afresh', async () => {
    actions.createTaskAction.mockResolvedValue(undefined)
    render(<CreateTaskForm />)
    await fillRepeatableTask()

    await waitFor(() => expect(success).toHaveBeenCalledWith('Task created.'))
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue(''))
    expect(screen.getByRole('checkbox', { name: 'Require proof' })).not.toBeChecked()
    expect(screen.queryByRole('combobox', { name: 'Cadence' })).toBeNull()
  })
})

describe('EditTaskForm', () => {
  it('keeps the edits after the server refuses them', async () => {
    actions.updateTaskAction.mockResolvedValue({ formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' })
    const onDone = vi.fn()
    render(<EditTaskForm id="edit-task-t1" task={GENESIS} onDone={onDone} />)
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Read Genesis 1-4')
    await userEvent.clear(screen.getByLabelText('Reward (DC)'))
    await userEvent.type(screen.getByLabelText('Reward (DC)'), '12')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Require proof' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Title')).toHaveValue('Read Genesis 1-4')
    expect(screen.getByLabelText('Description')).toHaveValue('Before Sunday')
    expect(screen.getByLabelText('Reward (DC)')).toHaveValue(12)
    expect(screen.getByRole('checkbox', { name: 'Require proof' })).toBeChecked()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('toasts once the edit is saved', async () => {
    actions.updateTaskAction.mockResolvedValue(undefined)
    const onDone = vi.fn()
    render(<EditTaskForm id="edit-task-t1" task={GENESIS} onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Task saved.'))
    expect(onDone).toHaveBeenCalled()
  })
})

describe('TaskCatalogItem', () => {
  it('toasts once a task is deactivated', async () => {
    actions.updateTaskAction.mockResolvedValue(undefined)
    render(
      <ul>
        <TaskCatalogItem task={GENESIS} />
      </ul>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Read Genesis 1-3' }))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Task deactivated.'))
  })

  it('toasts once a task is reactivated, and not when it fails', async () => {
    actions.updateTaskAction.mockResolvedValueOnce({ formError: 'Could not reactivate that task.' }).mockResolvedValueOnce(undefined)
    render(
      <ul>
        <TaskCatalogItem task={{ ...GENESIS, isActive: false }} />
      </ul>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Read Genesis 1-3' }))
    await screen.findByRole('alert')
    expect(success).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Read Genesis 1-3' }))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Task reactivated.'))
  })
})

describe('ProfileForm', () => {
  it('keeps the bio after the server refuses it', async () => {
    actions.updateProfileAction.mockResolvedValue({ formError: 'Could not save your profile.' })
    render(<ProfileForm displayName="Ben" bio="Choir" avatarSrc={null} />)
    await userEvent.type(screen.getByLabelText('Bio'), ' and tea')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Bio')).toHaveValue('Choir and tea')
  })

  it('previews the profile from what is typed, with the name as text, not a second heading', async () => {
    render(<ProfileForm displayName="Ben" bio="Choir" avatarSrc={null} />)
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview).toHaveTextContent('Choir')

    await userEvent.clear(screen.getByLabelText('Display name'))
    await userEvent.type(screen.getByLabelText('Display name'), 'Benji')
    await userEvent.type(screen.getByLabelText('Bio'), ' and tea')
    expect(preview).toHaveTextContent('Benji')
    expect(preview).toHaveTextContent('Choir and tea')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})

describe('PendingApprovals Select all (#65)', () => {
  const PENDING = [pendingRow('c1', 'p-alice', 'Alice'), pendingRow('c2', 'p-ben', 'Ben'), pendingRow('c3', 'p-cara', 'Cara')]

  function selectAll() {
    return screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement
  }

  it('shows indeterminate while some rows are ticked, and checked once all are', async () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    expect(selectAll()).not.toBeChecked()
    expect(selectAll().indeterminate).toBe(false)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice’s submission' }))
    expect(selectAll()).not.toBeChecked()
    expect(selectAll()).toBePartiallyChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Cara’s submission' }))
    expect(selectAll()).toBeChecked()
    expect(selectAll().indeterminate).toBe(false)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    expect(selectAll()).toBePartiallyChecked()
  })

  it('ticks and unticks every row, leaving out the reviewer’s own', async () => {
    render(<PendingApprovals viewerId="p-alice" pending={PENDING} />)
    await userEvent.click(selectAll())
    expect(screen.getByRole('checkbox', { name: 'Select Ben’s submission' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Cara’s submission' })).toBeChecked()
    expect(selectAll()).toBeChecked()

    await userEvent.click(selectAll())
    expect(screen.getByRole('checkbox', { name: 'Select Ben’s submission' })).not.toBeChecked()
    expect(selectAll()).not.toBeChecked()
  })

  it('follows rows that leave the list', async () => {
    const { rerender } = render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice’s submission' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    expect(selectAll()).toBePartiallyChecked()

    // Cara's submission was reviewed elsewhere: the two left are both ticked.
    rerender(<PendingApprovals viewerId="viewer-1" pending={PENDING.slice(0, 2)} />)
    expect(selectAll()).toBeChecked()

    // The ticked ones were approved: nothing left is ticked.
    rerender(<PendingApprovals viewerId="viewer-1" pending={[pendingRow('c4', 'p-dan', 'Dan')]} />)
    expect(selectAll()).not.toBeChecked()
    expect(selectAll().indeterminate).toBe(false)
  })

  it('keeps the ticked rows after a bulk action fails', async () => {
    actions.bulkApproveTaskCompletionsAction.mockResolvedValue({ formError: 'Could not approve those.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('checkbox', { name: 'Select Ben’s submission' })).toBeChecked()
    expect(selectAll()).toBePartiallyChecked()
  })
})

describe('Reject reasons (#200)', () => {
  it('keeps a row’s reason after the server refuses the reject', async () => {
    actions.rejectTaskCompletionAction.mockResolvedValue({ formError: 'Could not reject that submission.' })
    render(<ReviewButtons completionId="c1" submitterName="Alice" taskTitle="Read Genesis 1-3" />)
    await userEvent.type(screen.getByLabelText('Reason for rejecting (optional)'), 'Needs a photo')
    await userEvent.click(screen.getByRole('button', { name: /^Reject/ }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Reason for rejecting (optional)')).toHaveValue('Needs a photo')
    expect(success).not.toHaveBeenCalled()
  })

  it('clears a row’s reason once the reject goes through', async () => {
    actions.rejectTaskCompletionAction.mockResolvedValue(undefined)
    render(<ReviewButtons completionId="c1" submitterName="Alice" taskTitle="Read Genesis 1-3" />)
    await userEvent.type(screen.getByLabelText('Reason for rejecting (optional)'), 'Needs a photo')
    await userEvent.click(screen.getByRole('button', { name: /^Reject/ }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Submission rejected.'))
    expect((actions.rejectTaskCompletionAction.mock.calls[0][2] as FormData).get('reason')).toBe('Needs a photo')
    await waitFor(() => expect(screen.getByLabelText('Reason for rejecting (optional)')).toHaveValue(''))
  })

  it('keeps the shared reason after a bulk reject fails', async () => {
    actions.bulkRejectTaskCompletionsAction.mockResolvedValue({ formError: 'Select at least one completion.' })
    render(<PendingApprovals viewerId="viewer-1" pending={[pendingRow('c1', 'p-alice', 'Alice')]} />)
    await userEvent.type(screen.getByLabelText('Shared reason (optional)'), 'Try again next week')
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Shared reason (optional)')).toHaveValue('Try again next week')
  })

  it('clears the shared reason once a bulk reject goes through', async () => {
    actions.bulkRejectTaskCompletionsAction.mockResolvedValue({ summary: '1 rejected.' })
    render(<PendingApprovals viewerId="viewer-1" pending={[pendingRow('c1', 'p-alice', 'Alice')]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice’s submission' }))
    await userEvent.type(screen.getByLabelText('Shared reason (optional)'), 'Try again next week')
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))

    await screen.findByRole('status')
    expect((actions.bulkRejectTaskCompletionsAction.mock.calls[0][1] as FormData).get('reason')).toBe('Try again next week')
    await waitFor(() => expect(screen.getByLabelText('Shared reason (optional)')).toHaveValue(''))
  })
})
