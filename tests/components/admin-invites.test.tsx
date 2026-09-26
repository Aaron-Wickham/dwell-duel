// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InviteRow } from '@/lib/invites/list-invites'

const { addInviteAction, revokeInviteAction } = vi.hoisted(() => ({
  addInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
}))
vi.mock('@/lib/invites/actions', () => ({ addInviteAction, revokeInviteAction }))

import { InviteListItem } from '@/components/admin/invite-list-item'
import { AddInviteForm } from '@/app/(app)/admin/invites/add-invite-form'
import { RevokeInviteButton } from '@/app/(app)/admin/invites/revoke-invite-button'

function renderItem(invite: InviteRow) {
  render(
    <ul>
      <InviteListItem invite={invite} revoke={<RevokeInviteButton email={invite.email} />} />
    </ul>,
  )
}

beforeEach(() => {
  revokeInviteAction.mockReset()
})

describe('InviteListItem', () => {
  it('marks a claimed invite and offers no revoke', () => {
    renderItem({ email: 'sarah@example.com', claimed: true, createdAt: '2026-09-01T00:00:00Z' })
    expect(screen.getByRole('listitem')).toHaveTextContent('sarah@example.com (claimed)')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers a revoke named for the email, without repeating the email as text', () => {
    renderItem({ email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-01T00:00:00Z' })
    expect(screen.getByRole('button', { name: 'Revoke newfriend@example.com' })).toHaveAttribute('type', 'submit')
    expect(screen.getAllByText('newfriend@example.com')).toHaveLength(1)
    expect(screen.queryByText('(claimed)')).toBeNull()
    expect(document.querySelector('input[type="hidden"][name="email"]')).toHaveValue('newfriend@example.com')
  })

  it('ties a server error to the Revoke button', async () => {
    revokeInviteAction.mockResolvedValue({ formError: 'Could not revoke that invite.' })
    renderItem({ email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-01T00:00:00Z' })
    await userEvent.click(screen.getByRole('button', { name: 'Revoke newfriend@example.com' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not revoke that invite.')
    expect(screen.getByRole('button', { name: 'Revoke newfriend@example.com' })).toHaveAccessibleDescription(
      'Could not revoke that invite.',
    )
  })
})

describe('AddInviteForm', () => {
  it('keeps the placeholder the e2e suite fills, and describes the input with its hint', () => {
    render(<AddInviteForm />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('placeholder', 'friend@gmail.com')
    expect(input).toHaveAccessibleDescription('They can sign in with this Google account right away.')
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('type', 'submit')
  })

  it('ties a server error to the email input', async () => {
    addInviteAction.mockResolvedValue({ formError: 'That email is already invited.' })
    render(<AddInviteForm />)
    await userEvent.type(screen.getByLabelText('Email'), 'sarah@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('That email is already invited.')
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(
      'They can sign in with this Google account right away. That email is already invited.',
    )
  })
})
