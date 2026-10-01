// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MemberSummary } from '@/lib/members/list-members'

const { removeMemberAction, reinviteMemberAction, success } = vi.hoisted(() => ({
  removeMemberAction: vi.fn(),
  reinviteMemberAction: vi.fn(),
  success: vi.fn(),
}))
vi.mock('@/lib/admin/owner-actions', () => ({ removeMemberAction, reinviteMemberAction }))
vi.mock('sonner', () => ({ toast: { success } }))

import { RemoveMemberButton } from '@/app/(app)/admin/members/remove-member-button'
import { ReinviteMemberButton } from '@/app/(app)/admin/members/reinvite-member-button'

const BEN: MemberSummary = { id: 'p-ben', displayName: 'Ben', avatarSrc: null, email: 'ben@example.com', balance: 60, role: 'admin', joinedAt: null, lastSignInAt: null, removed: false }

beforeEach(() => {
  removeMemberAction.mockReset()
  reinviteMemberAction.mockReset()
  success.mockReset()
})

describe('RemoveMemberButton (#202)', () => {
  it('asks first, saying what removal does and does not touch, and removes nobody on Cancel', async () => {
    render(<RemoveMemberButton member={BEN} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ben from DwellDuel' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Ben from DwellDuel?' })
    expect(dialog).toHaveAccessibleDescription(
      'Ben loses their invite and any role straight away, and their devices stop getting notifications. Their coins, bets and history stay, and inviting them again brings them back.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(removeMemberAction).not.toHaveBeenCalled()
  })

  it('removes this member on confirm and toasts', async () => {
    removeMemberAction.mockResolvedValue(undefined)
    render(<RemoveMemberButton member={BEN} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ben from DwellDuel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove member' }))

    await waitFor(() => expect(removeMemberAction).toHaveBeenCalledOnce())
    expect(removeMemberAction.mock.calls[0][0]).toBe('p-ben')
    await waitFor(() => expect(success).toHaveBeenCalledWith('Ben removed.'))
  })

  it('shows the database’s refusal under the button', async () => {
    removeMemberAction.mockResolvedValue({ formError: 'Only the owner can remove a member.' })
    render(<RemoveMemberButton member={BEN} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ben from DwellDuel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove member' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Only the owner can remove a member.')
    expect(screen.getByRole('button', { name: 'Remove Ben from DwellDuel' })).toHaveAttribute('aria-describedby', 'remove-member-p-ben-error')
    expect(success).not.toHaveBeenCalled()
  })
})

// #265: inviting a removed member back restores their access, so it asks first.
describe('ReinviteMemberButton', () => {
  const REMOVED: MemberSummary = { ...BEN, role: 'member', removed: true }

  it('asks first, saying what coming back means, and invites nobody on Cancel', async () => {
    render(<ReinviteMemberButton member={REMOVED} />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite Ben again' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Invite Ben again?' })
    expect(dialog).toHaveAccessibleDescription(
      'Ben can sign in again straight away, as a Member, and is ranked again. Their coins, bets and history are as they left them.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(reinviteMemberAction).not.toHaveBeenCalled()
  })

  it('invites this member again on confirm and toasts', async () => {
    reinviteMemberAction.mockResolvedValue(undefined)
    render(<ReinviteMemberButton member={REMOVED} />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite Ben again' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Invite again' }))

    await waitFor(() => expect(reinviteMemberAction).toHaveBeenCalledOnce())
    expect(reinviteMemberAction.mock.calls[0][0]).toBe('p-ben')
    await waitFor(() => expect(success).toHaveBeenCalledWith('Ben invited again.'))
  })
})
