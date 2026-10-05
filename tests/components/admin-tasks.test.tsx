// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

import { PendingApprovals, type PendingRow } from '@/app/(app)/admin/(sections)/tasks/pending-approvals'
import { ReviewButtons } from '@/app/(app)/admin/(sections)/tasks/review-buttons'
import { CreateTaskForm } from '@/app/(app)/admin/(sections)/tasks/create-task-form'
import { TaskCatalogItem } from '@/app/(app)/admin/(sections)/tasks/task-catalog-item'

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

// Ticks one row and rejects it through the reason dialog, giving no reason.
async function rejectSelected(checkbox: string) {
  await userEvent.click(screen.getByRole('checkbox', { name: checkbox }))
  await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: /^Reject/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

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
    const row = screen.getByRole('row', { name: /Alice/ })
    expect(within(row).getByRole('cell', { name: '1h ago' })).toBeInTheDocument()
    expect(within(row).getByText('10 DC')).toHaveClass('text-gold')
    expect(within(row).getByText('Nothing attached')).toBeInTheDocument()
  })

  // #399: a table with the bulk bar above it; each row's Approve names what it approves.
  it('is a table under column headers, with the bulk bar above the rows', () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Select', 'Member', 'Task', 'Proof', 'Sent', 'Review'])
    const approves = screen.getAllByRole('button', { name: /Approve/ })
    expect(approves.map((button) => button.textContent)).toEqual([
      'Approve selected',
      'Approve Alice’s Read Genesis 1-3',
      'Approve Ben’s Memorize Psalm 23',
    ])
    expect(screen.getByText(/selected · pays/)).toHaveTextContent('0 selected · pays 0 DC')
  })

  it('says how many are selected and what they pay', async () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText(/selected · pays/)).toHaveTextContent('2 selected · pays 35 DC')
  })

  it('opens a submission’s note and proof from its Proof cell', async () => {
    const withProof: PendingRow = {
      ...PENDING[0],
      note: 'Read it twice',
      proof: [{ id: 'p1', kind: 'image', href: 'https://example.com/a.jpg', label: 'a.jpg' }],
    }
    const { container } = render(<PendingApprovals viewerId="viewer-1" pending={[withProof]} />)
    const details = container.querySelector('details')!
    expect(details.querySelector('summary')).toHaveTextContent('Note · 1 photo')
    expect(details).not.toHaveAttribute('open')
    await userEvent.click(within(details).getByText('Note · 1 photo'))
    expect(details).toHaveAttribute('open')
    expect(within(details).getByText('“Read it twice”')).toBeInTheDocument()
  })

  it("gives the reviewer's own submission no checkbox or buttons, and says why (#59)", () => {
    render(<PendingApprovals viewerId="p-alice" pending={PENDING} />)
    expect(rowCheckboxes().map((box) => box.value)).toEqual(['c2'])
    expect(screen.getByText('Yours: another reviewer reviews it.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Approve .+’s / })).toHaveLength(1)
  })

  it('checks every row with Select all', async () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    for (const box of rowCheckboxes()) expect(box).toBeChecked()
  })

  it('sends only the checked ids with Approve selected once confirmed, then shows the summary', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ summary: '1 approved.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Approve and pay' }))

    expect(await screen.findByRole('status')).toHaveTextContent('1 approved.')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    const [, formData] = bulkApproveTaskCompletionsAction.mock.calls[0]
    expect(formData.getAll('completionIds')).toEqual(['c2'])
  })

  it('asks before Approve selected pays out, saying how many and how much, and pays nothing on Cancel (#221)', async () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Approve 2 submissions?' })
    expect(dialog).toHaveAccessibleDescription('Pays 35 DC in rewards straight away.')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(bulkApproveTaskCompletionsAction).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Select Ben’s submission' })).toBeChecked()
  })

  it('does not ask before an Approve selected with nothing ticked', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ formError: 'Select at least one submission.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Select at least one submission.')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  // COPY-13: one optional reason, asked for in a dialog once Reject selected is pressed.
  it('asks Reject selected for one optional reason, then sends it with the checked ids', async () => {
    bulkRejectTaskCompletionsAction.mockResolvedValue({ summary: '1 rejected.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    expect(screen.queryByRole('textbox')).toBeNull()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject 1 submission?' })
    await userEvent.type(within(dialog).getByLabelText('Why not? (optional)'), 'Needs a photo')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(await screen.findByRole('status')).toHaveTextContent('1 rejected.')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const formData = bulkRejectTaskCompletionsAction.mock.calls[0][1] as FormData
    expect(formData.getAll('completionIds')).toEqual(['c1'])
    expect(formData.get('reason')).toBe('Needs a photo')
  })

  it('says to select something, with no dialog, when Reject selected has nothing ticked', async () => {
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Select at least one submission.')
    expect(screen.getByRole('button', { name: 'Reject selected' })).toHaveAccessibleDescription('Select at least one submission.')
    expect(bulkRejectTaskCompletionsAction).not.toHaveBeenCalled()
  })

  it('keeps the reason and the dialog open when the reject is refused', async () => {
    bulkRejectTaskCompletionsAction.mockResolvedValue({ formError: 'Reason is too long.', field: 'reason' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Why not? (optional)'), 'Too long')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reason is too long.')
    expect(within(dialog).getByLabelText('Why not? (optional)')).toHaveValue('Too long')
    expect(within(dialog).getByLabelText('Why not? (optional)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the empty state, and no bulk controls, when nothing is pending', () => {
    render(<PendingApprovals viewerId="viewer-1" pending={[]} />)
    expect(screen.getByText('No tasks to review.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve selected' })).toBeNull()
  })

  it('shows only the summary from the most recent bulk action', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ summary: '2 approved.' })
    bulkRejectTaskCompletionsAction.mockResolvedValue({ summary: '1 rejected.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    expect(await screen.findByText('2 approved.')).toBeInTheDocument()

    await rejectSelected('Select Alice’s submission')
    expect(await screen.findByText('1 rejected.')).toBeInTheDocument()
    expect(screen.queryByText('2 approved.')).not.toBeInTheDocument()
  })

  it('ties a bulk approve error to the Approve selected button as its accessible description', async () => {
    bulkApproveTaskCompletionsAction.mockResolvedValue({ formError: 'Select at least one submission.' })
    render(<PendingApprovals viewerId="viewer-1" pending={PENDING} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Select at least one submission.')
    expect(screen.getByRole('button', { name: 'Approve selected' })).toHaveAccessibleDescription(
      'Select at least one submission.',
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

    await rejectSelected('Select Alice’s submission')
    expect(await screen.findByText('1 rejected.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice’s submission' }))

    await userEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    expect(screen.queryByText('1 approved.')).not.toBeInTheDocument()

    resolveSecondApprove({ summary: '2 approved.' })
    expect(await screen.findByText('2 approved.')).toBeInTheDocument()
  })
})

describe('ReviewButtons', () => {
  it('ties an approve error to the Approve button, and asks for no reason on the row', async () => {
    approveTaskCompletionAction.mockResolvedValue({ formError: 'Could not approve that submission.' })
    render(<ReviewButtons completionId="c1" submitterName="Alice" taskTitle="Read Genesis 1-3" />)
    expect(screen.queryByRole('textbox')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Approve Alice’s Read Genesis 1-3' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not approve that submission.')
    expect(screen.getByRole('button', { name: 'Approve Alice’s Read Genesis 1-3' })).toHaveAccessibleDescription('Could not approve that submission.')
  })

  // COPY-13: a row's Reject asks for its optional reason in a dialog.
  it('rejects one submission through the reason dialog, sending the reason', async () => {
    rejectTaskCompletionAction.mockResolvedValue(undefined)
    render(<ReviewButtons completionId="c1" submitterName="Alice" taskTitle="Read Genesis 1-3" />)

    await userEvent.click(screen.getByRole('button', { name: 'Reject Alice’s Read Genesis 1-3' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject Alice’s Read Genesis 1-3?' })
    await userEvent.type(within(dialog).getByLabelText('Why not? (optional)'), 'Say it to your group first')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [id, , formData] = rejectTaskCompletionAction.mock.calls[0]
    expect(id).toBe('c1')
    expect((formData as FormData).get('reason')).toBe('Say it to your group first')
  })

  it('ties a reject error to the reason field in the dialog, marking it invalid', async () => {
    rejectTaskCompletionAction.mockResolvedValue({ formError: 'Reason is too long.', field: 'reason' })
    render(<ReviewButtons completionId="c1" submitterName="Alice" taskTitle="Read Genesis 1-3" />)

    await userEvent.click(screen.getByRole('button', { name: 'Reject Alice’s Read Genesis 1-3' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reason is too long.')
    const reason = within(dialog).getByLabelText('Why not? (optional)')
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveAccessibleDescription('Shown to them with the rejection. Reason is too long.')
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
    // Cancel unmounted the form under the keyboard, so focus goes back to what opened it.
    expect(edit).toHaveFocus()
  })

  it('saves an edit, keeping the task active, and closes the form', async () => {
    updateTaskAction.mockResolvedValue(undefined)
    renderItem(GENESIS)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Read Genesis 1-3' }))
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Read Genesis 1-4')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull())
    expect(screen.getByRole('button', { name: 'Edit Read Genesis 1-3' })).toHaveFocus()
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
