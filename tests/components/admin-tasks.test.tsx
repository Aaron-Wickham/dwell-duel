// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskSummary } from '@/lib/tasks/list-tasks'

const { bulkApproveTaskCompletionsAction, createTaskAction, updateTaskAction } = vi.hoisted(() => ({
  bulkApproveTaskCompletionsAction: vi.fn(),
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
}))
vi.mock('@/lib/tasks/review-task-completion', () => ({
  approveTaskCompletionAction: vi.fn(),
  rejectTaskCompletionAction: vi.fn(),
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction: vi.fn(),
}))
vi.mock('@/lib/tasks/create-task', () => ({ createTaskAction }))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction }))

import { PendingApprovals, type PendingRow } from '@/app/(app)/admin/tasks/pending-approvals'
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
  },
  {
    id: 'c2',
    taskTitle: 'Memorize Psalm 23',
    submitterId: 'p-ben',
    submitterName: 'Ben',
    rewardAmount: 25,
    submittedAt: '2026-09-24T10:00:00Z',
    submittedAge: '1d ago',
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
}

function rowCheckboxes() {
  return [...document.querySelectorAll<HTMLInputElement>('input[name="completionIds"]')]
}

beforeEach(() => {
  bulkApproveTaskCompletionsAction.mockReset()
  createTaskAction.mockReset()
  updateTaskAction.mockReset()
})

describe('PendingApprovals', () => {
  it('ties every row checkbox to the bulk form through its form attribute', () => {
    render(<PendingApprovals pending={PENDING} />)
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
    render(<PendingApprovals pending={PENDING} />)
    expect(screen.getByRole('checkbox', { name: 'Select Alice’s submission' })).toHaveAttribute('value', 'c1')
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/p-alice')
    expect(screen.getByText('Submitted 1h ago')).toBeInTheDocument()
    expect(screen.getByText('(10 DC)')).toBeInTheDocument()
    expect(screen.queryByText('Read Genesis 1-3 — 10 DC')).toBeNull()
  })

  it('puts the row buttons before the bulk ones, so the first "Approve" approves a row', () => {
    render(<PendingApprovals pending={PENDING} />)
    const approves = screen.getAllByRole('button', { name: /Approve/ })
    expect(approves.map((button) => button.textContent)).toEqual(['Approve', 'Approve', 'Approve selected'])
  })

  it('checks every row with Select all', async () => {
    render(<PendingApprovals pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    for (const box of rowCheckboxes()) expect(box).toBeChecked()
  })

  it('sends only the checked ids with Approve selected, then shows the summary', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ summary: '1 approved.' })
    render(<PendingApprovals pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))

    expect(await screen.findByRole('status')).toHaveTextContent('1 approved.')
    const [, formData] = bulkApproveTaskCompletionsAction.mock.calls[0]
    expect(formData.getAll('completionIds')).toEqual(['c2'])
  })

  it('shows the empty state, and no bulk controls, when nothing is pending', () => {
    render(<PendingApprovals pending={[]} />)
    expect(screen.getByText('Nothing pending.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve selected' })).toBeNull()
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
})
