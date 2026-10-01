// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { adjustBalanceAction } = vi.hoisted(() => ({ adjustBalanceAction: vi.fn() }))
vi.mock('@/lib/members/adjust-balance', () => ({ adjustBalanceAction }))
const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'

const BEN = { id: 'p-ben', displayName: 'Ben', avatarSrc: null, email: 'ben@example.com', balance: 60, role: 'member' as const, joinedAt: null, lastSignInAt: null, removed: false }

beforeEach(() => {
  adjustBalanceAction.mockReset()
  success.mockReset()
})

async function submit(amount: string, reason: string) {
  await userEvent.type(screen.getByLabelText('Amount'), amount)
  if (reason) await userEvent.type(screen.getByLabelText('Reason'), reason)
  await userEvent.click(screen.getByRole('button', { name: 'Adjust Ben' }))
}

describe('AdjustBalanceForm', () => {
  // The member's name, email and balance are their Admin page's header now (#254).
  it('is only the fields and a submit button named for the member', () => {
    render(<AdjustBalanceForm member={BEN} />)
    expect(screen.getByRole('button', { name: 'Adjust Ben' })).toHaveAttribute('type', 'submit')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('ben@example.com')).toBeNull()
    expect(screen.getByLabelText('Amount').closest('form')).toHaveClass('flex', 'flex-col', 'gap-3')
  })

  it('sends the amount and reason for this member', async () => {
    adjustBalanceAction.mockResolvedValue(undefined)
    render(<AdjustBalanceForm member={BEN} />)
    await submit('25', 'Choir volunteer bonus')
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust balance' }))

    await waitFor(() => expect(adjustBalanceAction).toHaveBeenCalledOnce())
    const [profileId, , formData] = adjustBalanceAction.mock.calls[0]
    expect(profileId).toBe('p-ben')
    expect(formData.get('amount')).toBe('25')
    expect(formData.get('reason')).toBe('Choir volunteer bonus')
  })

  it('ties a missing-reason error to the reason input only', async () => {
    adjustBalanceAction.mockResolvedValue({
      formError: 'Add a reason — it’s shown in the ledger next to this adjustment.',
      field: 'reason',
    })
    render(<AdjustBalanceForm member={BEN} />)
    await submit('-50', '')

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Add a reason — it’s shown in the ledger next to this adjustment.')
    expect(error).toHaveAttribute('id', 'adjust-p-ben-error')
    expect(screen.getByLabelText('Reason')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Reason')).toHaveAttribute('aria-describedby', 'adjust-p-ben-error')
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('aria-describedby')
  })

  it('ties an amount error to the amount input only', async () => {
    adjustBalanceAction.mockResolvedValue({ formError: 'Enter a non-zero whole number of DC.', field: 'amount' })
    render(<AdjustBalanceForm member={BEN} />)
    await submit('0', 'Oops')

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-describedby', 'adjust-p-ben-error')
    expect(screen.getByLabelText('Reason')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('AdjustBalanceForm confirmation (#65)', () => {
  it('asks before adjusting, saying how much moves, and adjusts nothing on Cancel', async () => {
    render(<AdjustBalanceForm member={BEN} />)
    await submit('-20', 'Duplicate reward')

    const dialog = await screen.findByRole('alertdialog', { name: 'Adjust Ben’s balance?' })
    expect(dialog).toHaveAccessibleDescription('Takes 20 DC from Ben’s balance of 60 DC, straight away.')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(adjustBalanceAction).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Amount')).toHaveValue(-20)
    expect(screen.getByLabelText('Reason')).toHaveValue('Duplicate reward')
  })

  it('toasts and clears the fields once the adjustment goes through', async () => {
    adjustBalanceAction.mockResolvedValue(undefined)
    render(<AdjustBalanceForm member={BEN} />)
    await submit('25', 'Choir volunteer bonus')
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription('Adds 25 DC to Ben’s balance of 60 DC, straight away.')
    await userEvent.click(screen.getByRole('button', { name: 'Adjust balance' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Balance adjusted.'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByLabelText('Amount')).toHaveValue(null)
    expect(screen.getByLabelText('Reason')).toHaveValue('')
  })
})

describe('AdjustBalanceForm keeps what was filled in (#63)', () => {
  it('keeps the amount and reason after the server refuses', async () => {
    adjustBalanceAction.mockResolvedValue({ formError: 'That would take Ben’s balance below zero — they have 60 DC.', field: 'amount' })
    render(<AdjustBalanceForm member={BEN} />)
    await submit('-80', 'Correction')
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust balance' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Amount')).toHaveValue(-80)
    expect(screen.getByLabelText('Reason')).toHaveValue('Correction')
    expect(success).not.toHaveBeenCalled()
  })
})
