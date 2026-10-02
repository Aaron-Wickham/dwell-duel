// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import type { MemberSummary } from '@/lib/members/list-members'

const actions = vi.hoisted(() => ({
  setMemberRoleAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  deleteMarketAction: vi.fn(),
  updateTaskAction: vi.fn(),
}))
vi.mock('@/lib/admin/owner-actions', () => ({
  setMemberRoleAction: actions.setMemberRoleAction,
  deleteTaskAction: actions.deleteTaskAction,
  deleteMarketAction: actions.deleteMarketAction,
}))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction: actions.updateTaskAction }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { RoleForm } from '@/app/(app)/admin/members/role-form'
import { MemberChip } from '@/app/(app)/admin/members/member-chip'
import { TaskCatalogItem } from '@/app/(app)/admin/(sections)/tasks/task-catalog-item'

const BEN: MemberSummary = { id: 'p-ben', displayName: 'Ben', avatarSrc: null, email: 'ben@example.com', balance: 60, role: 'reviewer', joinedAt: null, lastSignInAt: null, removed: false }
const TASK: TaskSummary = {
  id: 't1',
  title: 'Read Genesis 1-3',
  description: null,
  rewardAmount: 10,
  isRepeatable: false,
  period: null,
  isActive: true,
  proofRequired: false,
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset()
})

describe('RoleForm', () => {
  it('offers Admin, Reviewer and Member, never Owner, starting on the current role', () => {
    render(<RoleForm member={BEN} />)
    const select = screen.getByLabelText('Role')
    expect(select).toHaveValue('reviewer')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Admin', 'Reviewer', 'Member'])
  })

  it('saves the chosen role for this member', async () => {
    actions.setMemberRoleAction.mockResolvedValue({ saved: true })
    render(<RoleForm member={BEN} />)
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Save role for Ben' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Change role' }))
    await waitFor(() => expect(actions.setMemberRoleAction).toHaveBeenCalledOnce())
    const [profileId, , formData] = actions.setMemberRoleAction.mock.calls[0]
    expect(profileId).toBe('p-ben')
    expect((formData as FormData).get('role')).toBe('admin')
  })
})

describe('RoleForm confirmation (#65)', () => {
  it('asks before changing a role, and changes nothing on Cancel, keeping the choice', async () => {
    render(<RoleForm member={BEN} />)
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Save role for Ben' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Change Ben’s role?' })
    expect(dialog).toHaveAccessibleDescription('Ben goes from Reviewer to Admin, straight away.')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(actions.setMemberRoleAction).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Role')).toHaveValue('admin')
  })

  it('keeps the chosen role after the server refuses it', async () => {
    actions.setMemberRoleAction.mockResolvedValue({ formError: 'Only the owner can change roles.' })
    render(<RoleForm member={BEN} />)
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'member')
    await userEvent.click(screen.getByRole('button', { name: 'Save role for Ben' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Change role' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Role')).toHaveValue('member')
  })
})

describe('MemberChip', () => {
  it('badges every role but member', () => {
    const { rerender } = render(<MemberChip member={BEN} />)
    expect(screen.getByText('Reviewer')).toBeInTheDocument()
    rerender(<MemberChip member={{ ...BEN, role: 'member' }} />)
    expect(screen.queryByText('Member')).not.toBeInTheDocument()
  })

  // #265: a removed member's role is already back to Member; Removed takes its place.
  it('marks a removed member Removed instead of a role', () => {
    render(<MemberChip member={{ ...BEN, role: 'admin', removed: true }} />)
    expect(screen.getByText('Removed')).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })
})

describe('TaskCatalogItem', () => {
  it('offers Delete only to the owner', () => {
    const { rerender } = render(<TaskCatalogItem task={TASK} />)
    expect(screen.queryByRole('button', { name: 'Delete Read Genesis 1-3' })).not.toBeInTheDocument()
    rerender(<TaskCatalogItem task={TASK} canDelete />)
    expect(screen.getByRole('button', { name: 'Delete Read Genesis 1-3' })).toBeInTheDocument()
  })
})
