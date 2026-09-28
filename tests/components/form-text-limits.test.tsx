// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskSummary } from '@/lib/tasks/list-tasks'

const actions = vi.hoisted(() => ({
  createMarketAction: vi.fn(),
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  approveTaskCompletionAction: vi.fn(),
  rejectTaskCompletionAction: vi.fn(),
  bulkApproveTaskCompletionsAction: vi.fn(),
  bulkRejectTaskCompletionsAction: vi.fn(),
  adjustBalanceAction: vi.fn(),
  addInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  updateProfileAction: vi.fn(),
}))
vi.mock('@/lib/markets/create-market', () => ({ createMarketAction: actions.createMarketAction }))
vi.mock('@/lib/tasks/create-task', () => ({ createTaskAction: actions.createTaskAction }))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction: actions.updateTaskAction }))
vi.mock('@/lib/tasks/review-task-completion', () => ({
  approveTaskCompletionAction: actions.approveTaskCompletionAction,
  rejectTaskCompletionAction: actions.rejectTaskCompletionAction,
  bulkApproveTaskCompletionsAction: actions.bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction: actions.bulkRejectTaskCompletionsAction,
}))
vi.mock('@/lib/members/adjust-balance', () => ({ adjustBalanceAction: actions.adjustBalanceAction }))
vi.mock('@/lib/profile/update-profile', () => ({ updateProfileAction: actions.updateProfileAction }))
vi.mock('@/lib/invites/actions', () => ({ addInviteAction: actions.addInviteAction, revokeInviteAction: actions.revokeInviteAction }))

import { CreateMarketForm } from '@/app/(app)/markets/new/create-market-form'
import { CreateTaskForm } from '@/app/(app)/admin/tasks/create-task-form'
import { EditTaskForm } from '@/app/(app)/admin/tasks/edit-task-form'
import { PendingApprovals, type PendingRow } from '@/app/(app)/admin/tasks/pending-approvals'
import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'
import { AddInviteForm } from '@/app/(app)/admin/invites/add-invite-form'
import { ProfileForm } from '@/app/(app)/profile/profile-form'

const GENESIS: TaskSummary = {
  id: 't1',
  title: 'Read Genesis 1-3',
  description: null,
  rewardAmount: 10,
  isRepeatable: false,
  period: null,
  isActive: true,
  proofRequired: false,
}

const PENDING: PendingRow[] = [
  {
    id: 'c1',
    taskTitle: 'Read Genesis 1-3',
    submitterId: 'p-alice',
    submitterName: 'Alice',
    rewardAmount: 10,
    submittedAt: '2026-09-25T09:00:00Z',
    submittedAge: '1h ago',
    note: null,
    proof: [],
  },
]

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset()
})

describe('text limits on form inputs', () => {
  it('caps the market title, description and every outcome label', async () => {
    render(<CreateMarketForm />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '120')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '1000')

    await userEvent.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add outcome' }))
    for (const n of [1, 2, 3]) expect(screen.getByLabelText(`Outcome ${n}`)).toHaveAttribute('maxlength', '60')
  })

  it('caps the task title and description in the create form', () => {
    render(<CreateTaskForm />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '120')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '1000')
  })

  it('caps the task title and description in the edit form', () => {
    render(<EditTaskForm id="edit-task-t1" task={GENESIS} onDone={() => {}} />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '120')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '1000')
  })

  it('caps the single and shared rejection reasons', () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    expect(screen.getByLabelText('Reason for rejecting (optional)')).toHaveAttribute('maxlength', '500')
    expect(screen.getByLabelText('Shared reason (optional)')).toHaveAttribute('maxlength', '500')
  })

  it('caps the balance-adjust reason and the invite email', () => {
    render(
      <>
        <AdjustBalanceForm member={{ id: 'p-ben', displayName: 'Ben', avatarSrc: null, email: 'ben@example.com', balance: 60, role: 'member' }} />
        <AddInviteForm />
      </>,
    )
    expect(screen.getByLabelText('Reason')).toHaveAttribute('maxlength', '200')
    expect(screen.getByLabelText('Email')).toHaveAttribute('maxlength', '254')
  })
})

describe('the profile form', () => {
  it('caps the display name and bio', () => {
    render(<ProfileForm displayName="Ben" bio="" avatarSrc={null} />)
    expect(screen.getByLabelText('Display name')).toHaveAttribute('maxlength', '80')
    expect(screen.getByLabelText('Bio')).toHaveAttribute('maxlength', '160')
  })

  it('ties a too-long bio error to the bio only', async () => {
    actions.updateProfileAction.mockResolvedValue({ formError: 'Bio can be at most 160 characters.', field: 'bio' })
    render(<ProfileForm displayName="Ben" bio="" avatarSrc={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Bio can be at most 160 characters.')
    expect(screen.getByLabelText('Bio')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Bio')).toHaveAccessibleDescription(
      'Optional. Up to 160 characters, shown on your profile. Bio can be at most 160 characters.',
    )
    expect(screen.getByLabelText('Display name')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('too-long errors point at their field', () => {
  it('ties a market description error to the description only', async () => {
    actions.createMarketAction.mockResolvedValue({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    render(<CreateMarketForm />)

    await userEvent.type(screen.getByLabelText('Title'), 'Will it rain?')
    await userEvent.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await userEvent.click(screen.getByRole('button', { name: 'Create market' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false')
  })

  it('ties a too-long outcome error to that outcome only', async () => {
    actions.createMarketAction.mockResolvedValue({ formError: 'Outcome 3 can be at most 60 characters.', field: 'outcome_3' })
    render(<CreateMarketForm />)

    await userEvent.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add outcome' }))
    await userEvent.type(screen.getByLabelText('Title'), 'Who wins the trivia night?')
    await userEvent.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await userEvent.click(screen.getByRole('button', { name: 'Create market' }))

    await screen.findByRole('alert')
    const third = screen.getByLabelText('Outcome 3')
    expect(third).toHaveAttribute('aria-invalid', 'true')
    expect(third).toHaveAccessibleDescription('Outcome 3 can be at most 60 characters.')
    expect(screen.getByLabelText('Outcome 1')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Outcome 2')).not.toHaveAttribute('aria-invalid')
  })

  it('ties a task description error to the description', async () => {
    actions.createTaskAction.mockResolvedValue({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    render(<CreateTaskForm />)

    await userEvent.type(screen.getByLabelText('Title'), 'Read Genesis 1-3')
    await userEvent.type(screen.getByLabelText('Reward (DC)'), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription('Description can be at most 1000 characters.')
  })

  it('ties an edit-form description error to the description', async () => {
    actions.updateTaskAction.mockResolvedValue({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    render(<EditTaskForm id="edit-task-t1" task={GENESIS} onDone={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-describedby', 'edit-task-t1-error')
  })

  it('ties a shared-reason error to the shared reason field', async () => {
    actions.bulkRejectTaskCompletionsAction.mockResolvedValue({ formError: 'Reason can be at most 500 characters.', field: 'reason' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Reason can be at most 500 characters.')
    const shared = screen.getByLabelText('Shared reason (optional)')
    expect(shared).toHaveAttribute('aria-invalid', 'true')
    expect(shared).toHaveAccessibleDescription('Reason can be at most 500 characters.')
  })
})
