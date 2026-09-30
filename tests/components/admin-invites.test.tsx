// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InviteRow } from '@/lib/invites/list-invites'

const { addInviteAction, revokeInviteAction } = vi.hoisted(() => ({
  addInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
}))
vi.mock('@/lib/invites/actions', () => ({ addInviteAction, revokeInviteAction }))
const { success, error: toastError } = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success, error: toastError } }))

import { InviteListItem } from '@/components/admin/invite-list-item'
import { AddInviteForm } from '@/app/(app)/admin/invites/add-invite-form'
import { RevokeInviteButton } from '@/app/(app)/admin/invites/revoke-invite-button'
import { CopyInviteButton } from '@/app/(app)/admin/invites/copy-invite-button'

const MESSAGE =
  "You're invited to DwellDuel, our group's friendly prediction market. Sign in at https://www.dwellduel.com with this Google account: newfriend@example.com"

function renderItem(invite: InviteRow) {
  render(
    <ul>
      <InviteListItem
        invite={invite}
        actions={
          <>
            <CopyInviteButton email={invite.email} />
            <RevokeInviteButton email={invite.email} />
          </>
        }
      />
    </ul>,
  )
}

beforeEach(() => {
  revokeInviteAction.mockReset()
  addInviteAction.mockReset()
  success.mockReset()
  toastError.mockReset()
})

function mockClipboard(writeText: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

function mockExecCommand(result: boolean) {
  const copied: string[] = []
  const execCommand = vi.fn((command: string) => {
    const active = document.querySelector('textarea')
    if (command === 'copy' && active) copied.push(active.value)
    return result
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
  return { execCommand, copied }
}

afterEach(() => {
  mockClipboard(undefined)
})

describe('InviteListItem', () => {
  it('marks a claimed invite and offers no revoke or copy', () => {
    renderItem({ email: 'sarah@example.com', claimed: true, createdAt: '2026-09-01T00:00:00Z' })
    expect(screen.getByRole('listitem')).toHaveTextContent('sarah@example.com (claimed)')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers copy and revoke named for the email, without repeating the email as text', () => {
    renderItem({ email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-01T00:00:00Z' })
    expect(screen.getByRole('button', { name: 'Revoke newfriend@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy invite message for newfriend@example.com' })).toHaveAttribute('type', 'button')
    expect(screen.getAllByText('newfriend@example.com')).toHaveLength(1)
    expect(screen.queryByText('(claimed)')).toBeNull()
  })

  it('asks before revoking, and revokes nothing on Cancel (#65)', async () => {
    renderItem({ email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-01T00:00:00Z' })
    await userEvent.click(screen.getByRole('button', { name: 'Revoke newfriend@example.com' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Revoke this invite?' })
    expect(dialog).toHaveAccessibleDescription(
      'newfriend@example.com won’t be able to join with this invite. You can invite them again later.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(revokeInviteAction).not.toHaveBeenCalled()
  })

  it('revokes this email once confirmed, and toasts (#65)', async () => {
    revokeInviteAction.mockResolvedValue(undefined)
    renderItem({ email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-01T00:00:00Z' })
    await userEvent.click(screen.getByRole('button', { name: 'Revoke newfriend@example.com' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke invite' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Invite revoked.'))
    expect((revokeInviteAction.mock.calls[0][1] as FormData).get('email')).toBe('newfriend@example.com')
  })

  it('ties a server error to the Revoke button', async () => {
    revokeInviteAction.mockResolvedValue({ formError: 'Could not revoke that invite.' })
    renderItem({ email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-01T00:00:00Z' })
    await userEvent.click(screen.getByRole('button', { name: 'Revoke newfriend@example.com' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke invite' }))

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
    expect(screen.getByRole('button', { name: 'Add invite' })).toHaveAttribute('type', 'submit')
  })

  it('ties a server error to the email input', async () => {
    addInviteAction.mockResolvedValue({ formError: 'That email is already invited.' })
    render(<AddInviteForm />)
    await userEvent.type(screen.getByLabelText('Email'), 'sarah@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add invite' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('That email is already invited.')
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(
      'They can sign in with this Google account right away. That email is already invited.',
    )
  })
})

describe('CopyInviteButton (#85)', () => {
  it('copies the invite message with the Clipboard API, and toasts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    const { execCommand } = mockExecCommand(true)
    render(<CopyInviteButton email="newfriend@example.com" />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy invite message for newfriend@example.com' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Invite message copied.'))
    expect(writeText).toHaveBeenCalledWith(MESSAGE)
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to a hidden textarea and execCommand without the Clipboard API, and cleans up', async () => {
    mockClipboard(undefined)
    const { execCommand, copied } = mockExecCommand(true)
    render(<CopyInviteButton email="newfriend@example.com" />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy invite message for newfriend@example.com' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Invite message copied.'))
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(copied).toEqual([MESSAGE])
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when the Clipboard API refuses', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')))
    const { copied } = mockExecCommand(true)
    render(<CopyInviteButton email="newfriend@example.com" />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy invite message for newfriend@example.com' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Invite message copied.'))
    expect(copied).toEqual([MESSAGE])
  })

  it('says so when neither way copies', async () => {
    mockClipboard(undefined)
    mockExecCommand(false)
    render(<CopyInviteButton email="newfriend@example.com" />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy invite message for newfriend@example.com' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Couldn’t copy the invite message. Try again.'))
    expect(success).not.toHaveBeenCalled()
  })
})

describe('AddInviteForm after adding (#85)', () => {
  it('offers to copy the invite message for the email just added, without repeating it as text', async () => {
    addInviteAction.mockResolvedValue({ addedEmail: 'newfriend@example.com' })
    render(<AddInviteForm />)
    await userEvent.type(screen.getByLabelText('Email'), 'NewFriend@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add invite' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Invite added. Send them the invite message so they know to sign in.')
    expect(screen.getByRole('button', { name: 'Copy invite message for newfriend@example.com' })).toBeInTheDocument()
    expect(screen.queryByText(/newfriend@example\.com/)).toBeNull()
  })

  it('offers no copy before anything is added', () => {
    render(<AddInviteForm />)
    expect(screen.queryByRole('button', { name: /Copy invite message/ })).toBeNull()
  })
})
