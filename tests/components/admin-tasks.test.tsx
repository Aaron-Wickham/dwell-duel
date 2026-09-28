// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskSummary } from '@/lib/tasks/list-tasks'

const {
  approveTaskCompletionAction,
  rejectTaskCompletionAction,
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
  createTaskAction,
  updateTaskAction,
} = vi.hoisted(() => ({
  approveTaskCompletionAction: vi.fn(),
  rejectTaskCompletionAction: vi.fn(),
  bulkApproveTaskCompletionsAction: vi.fn(),
  bulkRejectTaskCompletionsAction: vi.fn(),
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
}))
vi.mock('@/lib/tasks/review-task-completion', () => ({
  approveTaskCompletionAction,
  rejectTaskCompletionAction,
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
}))
vi.mock('@/lib/tasks/create-task', () => ({ createTaskAction }))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction }))

import { PendingApprovals, type PendingRow } from '@/app/(app)/admin/tasks/pending-approvals'
import { ReviewButtons } from '@/app/(app)/admin/tasks/review-buttons'
import { CreateTaskForm } from '@/app/(app)/admin/tasks/create-task-form'
import { TaskCatalogItem } from '@/app/(app)/admin/tasks/task-catalog-item'

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
  {
    id: 'c2',
    taskTitle: 'Memorize Psalm 23',
    submitterId: 'p-ben',
    submitterName: 'Ben',
    rewardAmount: 25,
    submittedAt: '2026-09-24T10:00:00Z',
    submittedAge: '1d ago',
    note: null,
    proof: [],
  },
]

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

function rowCheckboxes() {
  return [...document.querySelectorAll<HTMLInputElement>('input[name="completionIds"]')]
}

beforeEach(() => {
  approveTaskCompletionAction.mockReset()
  rejectTaskCompletionAction.mockReset()
  bulkApproveTaskCompletionsAction.mockReset()
  bulkRejectTaskCompletionsAction.mockReset()
  createTaskAction.mockReset()
  updateTaskAction.mockReset()
})

describe('PendingApprovals', () => {
  it('ties every row checkbox to the bulk form through its form attribute', () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    const bulkForm = screen.getByRole('button', { name: 'Approve selected' }).closest('form')!
    const boxes = rowCheckboxes()
    expect(boxes.map((box) => box.value)).toEqual(['c1', 'c2'])
    for (const box of boxes) {
      expect(box).toHaveAttribute('form', bulkForm.id)
      expect(box.form).toBe(bulkForm)
      expect(bulkForm).not.toContainElement(box)
    }
  })

  it('names each checkbox for its submitter and shows what they did', () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    expect(screen.getByRole('checkbox', { name: 'Select Alice’s submission' })).toHaveAttribute('value', 'c1')
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/p-alice')
    expect(screen.getByText('Submitted 1h ago')).toBeInTheDocument()
    expect(screen.getByText('(10 DC)')).toBeInTheDocument()
    expect(screen.queryByText('Read Genesis 1-3 — 10 DC')).toBeNull()
  })

  it('puts the row buttons before the bulk ones, so the first "Approve" approves a row', () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    const approves = screen.getAllByRole('button', { name: /Approve/ })
    expect(approves.map((button) => button.textContent)).toEqual([
      'Approve Alice’s Read Genesis 1-3',
      'Approve Ben’s Memorize Psalm 23',
      'Approve selected',
    ])
  })

  it("gives the reviewer's own submission no checkbox or buttons, and says why (#59)", () => {
    render(<PendingApprovals viewerId="p-alice" pending={PENDING} />)
    expect(rowCheckboxes().map((box) => box.value)).toEqual(['c2'])
    expect(screen.getByText('This is your submission, so another reviewer reviews it.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Approve .+’s / })).toHaveLength(1)
  })

  it('checks every row with Select all', async () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    for (const box of rowCheckboxes()) expect(box).toBeChecked()
  })

  it('sends only the checked ids with Approve selected, then shows the summary', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ summary: '1 approved.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))

    expect(await screen.findByRole('status')).toHaveTextContent('1 approved.')
    const [, formData] = bulkApproveTaskCompletionsAction.mock.calls[0]
    expect(formData.getAll('completionIds')).toEqual(['c2'])
  })

  it('shows the empty state, and no bulk controls, when nothing is pending', () => {
    render(<PendingApprovals viewerId="viewer-1" pending={[]} />)
    expect(screen.getByText('Nothing pending.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve selected' })).toBeNull()
  })

  it('shows only the summary from the most recent bulk action', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ summary: '2 approved.' })
    bulkRejectTaskCompletionsAction.mockResolvedValue({ summary: '1 rejected.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    expect(await screen.findByText('2 approved.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
    expect(await screen.findByText('1 rejected.')).toBeInTheDocument()
    expect(screen.queryByText('2 approved.')).not.toBeInTheDocument()
  })

  it('ties a bulk approve error to the Approve selected button as its accessible description', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ formError: 'Select at least one completion.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Select at least one completion.')
    expect(screen.getByRole('button', { name: 'Approve selected' })).toHaveAccessibleDescription(
      'Select at least one completion.',
    )
  })

  it("hides the previous bulk result while a new bulk action is pending, so approve → reject → approve doesn't flash the first result", async () => {
    let resolveSecondApprove: (state: { summary: string }) => void = () => {}
    bulkApproveTaskCompletionsAction
      .mockResolvedValueOnce({ summary: '1 approved.' })
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecondApprove = resolve)))
    bulkRejectTaskCompletionsAction.mockResolvedValue({ summary: '1 rejected.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    expect(await screen.findByText('1 approved.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
    expect(await screen.findByText('1 rejected.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    expect(screen.queryByText('1 approved.')).not.toBeInTheDocument()

    resolveSecondApprove({ summary: '2 approved.' })
    expect(await screen.findByText('2 approved.')).toBeInTheDocument()
  })
})

describe('ReviewButtons', () => {
  it('ties an approve error to the Approve button, leaving the reject reason untouched', async () => {
    approveTaskCompletionAction.mockResolvedValue({ formError: 'Could not approve that submission.' })
    render(<ReviewButtons completionId="c1" submitterName="Alice" taskTitle="Read Genesis 1-3" />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve Alice’s Read Genesis 1-3' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not approve that submission.')
    expect(screen.getByRole('button', { name: 'Approve Alice’s Read Genesis 1-3' })).toHaveAccessibleDescription('Could not approve that submission.')
    expect(screen.getByPlaceholderText('Reason (optional)')).toHaveAttribute('aria-invalid', 'false')
  })

  it('ties a reject error to the reason field, marking it invalid', async () => {
    rejectTaskCompletionAction.mockResolvedValue({ formError: 'Could not reject that submission.' })
    render(<ReviewButtons completionId="c1" submitterName="Alice" taskTitle="Read Genesis 1-3" />)

    await userEvent.click(screen.getByRole('button', { name: 'Reject Alice’s Read Genesis 1-3' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not reject that submission.')
    const reason = screen.getByPlaceholderText('Reason (optional)')
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveAccessibleDescription('Could not reject that submission.')
  })
})

describe('CreateTaskForm', () => {
  it('labels the fields the e2e suite fills', () => {
    render(<CreateTaskForm />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('name', 'title')
    expect(screen.getByLabelText('Reward (DC)')).toHaveAttribute('name', 'reward_amount')
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveAttribute('type', 'submit')
  })

  it('asks for a cadence only for a repeatable task', async () => {
    render(<CreateTaskForm />)
    expect(screen.queryByLabelText('Cadence')).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Repeatable' }))
    expect(screen.getByRole('combobox', { name: 'Cadence' })).toHaveAttribute('name', 'period')
  })

  it('ties a reward error to the reward input only', async () => {
    createTaskAction.mockResolvedValue({ formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' })
    render(<CreateTaskForm />)
    await userEvent.type(screen.getByLabelText('Title'), 'Read Ruth')
    await userEvent.type(screen.getByLabelText('Reward (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('alert')).toHaveAttribute('id', 'create-task-error')
    expect(screen.getByLabelText('Reward (DC)')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Reward (DC)')).toHaveAttribute('aria-describedby', 'create-task-error')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('TaskCatalogItem', () => {
  function renderItem(task: TaskSummary) {
    render(
      <ul>
        <TaskCatalogItem task={task} />
      </ul>,
    )
  }

  it('shows the title and reward as one piece of text', () => {
    renderItem(GENESIS)
    expect(screen.getAllByText('Read Genesis 1-3 — 10 DC')).toHaveLength(1)
    expect(screen.queryByText('Inactive')).toBeNull()
    expect(screen.queryByText('Weekly')).toBeNull()
  })

  it('deactivates an active task by resending its fields without is_active', async () => {
    updateTaskAction.mockResolvedValue(undefined)
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Read Genesis 1-3' }))

    await waitFor(() => expect(updateTaskAction).toHaveBeenCalledOnce())
    const [taskId, , formData] = updateTaskAction.mock.calls[0]
    expect(taskId).toBe('t1')
    expect(formData.get('title')).toBe('Read Genesis 1-3')
    expect(formData.get('reward_amount')).toBe('10')
    expect(formData.has('is_active')).toBe(false)
  })

  it('shows an inactive weekly task as Inactive and Weekly, and reactivates it', async () => {
    updateTaskAction.mockResolvedValue(undefined)
    renderItem({ ...GENESIS, isActive: false, isRepeatable: true, period: 'weekly' })
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('Weekly')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Read Genesis 1-3' }))

    await waitFor(() => expect(updateTaskAction).toHaveBeenCalledOnce())
    expect(updateTaskAction.mock.calls[0][2].get('is_active')).toBe('on')
  })

  it('opens the edit form and closes it on Cancel', async () => {
    renderItem(GENESIS)
    const edit = screen.getByRole('button', { name: 'Edit Read Genesis 1-3' })
    expect(edit).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Title')).toBeNull()

    await userEvent.click(edit)
    expect(edit).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Title')).toHaveValue('Read Genesis 1-3')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(updateTaskAction).not.toHaveBeenCalled()
  })

  it('saves an edit, keeping the task active, and closes the form', async () => {
    updateTaskAction.mockResolvedValue(undefined)
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Read Genesis 1-3' }))
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Read Genesis 1-4')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull())
    const [taskId, , formData] = updateTaskAction.mock.calls[0]
    expect(taskId).toBe('t1')
    expect(formData.get('title')).toBe('Read Genesis 1-4')
    expect(formData.get('is_active')).toBe('on')
  })

  it('keeps the edit form open and ties a title error to the title input', async () => {
    updateTaskAction.mockResolvedValue({ formError: 'Enter a title.', field: 'title' })
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Read Genesis 1-3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title.')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-describedby', 'edit-task-t1-error')
  })

  it('ties a toggle error to the Deactivate button', async () => {
    updateTaskAction.mockResolvedValue({ formError: 'Could not deactivate that task.' })
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Read Genesis 1-3' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not deactivate that task.')
    expect(screen.getByRole('button', { name: 'Deactivate Read Genesis 1-3' })).toHaveAccessibleDescription(
      'Could not deactivate that task.',
    )
  })
})
