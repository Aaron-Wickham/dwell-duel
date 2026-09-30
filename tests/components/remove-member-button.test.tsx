// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MemberSummary } from '@/lib/members/list-members'

const { removeMemberAction, success } = vi.hoisted(() => ({ removeMemberAction: vi.fn(), success: vi.fn() }))
vi.mock('@/lib/admin/owner-actions', () => ({ removeMemberAction }))
vi.mock('sonner', () => ({ toast: { success } }))

import { RemoveMemberButton } from '@/app/(app)/admin/members/remove-member-button'

const BEN: MemberSummary = { id: 'p-ben', displayName: 'Ben', avatarSrc: null, email: 'ben@example.com', balance: 60, role: 'admin', joinedAt: null, lastSignInAt: null }

beforeEach(() => {
  removeMemberAction.mockReset()
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
