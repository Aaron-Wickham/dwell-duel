// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { adjustBalanceAction } = vi.hoisted(() => ({ adjustBalanceAction: vi.fn() }))
vi.mock('@/lib/members/adjust-balance', () => ({ adjustBalanceAction }))

import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'

const BEN = { id: 'p-ben', displayName: 'Ben', email: 'ben@example.com', balance: 60, isAdmin: false }

beforeEach(() => {
  adjustBalanceAction.mockReset()
})

async function submit(amount: string, reason: string) {
  await userEvent.type(screen.getByLabelText('Amount'), amount)
  if (reason) await userEvent.type(screen.getByLabelText('Reason'), reason)
  await userEvent.click(screen.getByRole('button', { name: 'Adjust Ben' }))
}

describe('AdjustBalanceForm', () => {
  it('links the member to their profile and shows their balance', () => {
    render(<AdjustBalanceForm member={BEN} />)
    expect(screen.getByRole('link', { name: 'Ben' })).toHaveAttribute('href', '/members/p-ben')
    expect(screen.getByText('60 DC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust Ben' })).toHaveAttribute('type', 'submit')
  })

  it('spaces the member block from the fields at 12px on phone and 16px on desktop, keeping 12px/8px before the button', () => {
    render(<AdjustBalanceForm member={BEN} />)

    const form = screen.getByRole('link', { name: 'Ben' }).closest('form')
    expect(form).toHaveClass('gap-3', 'md:gap-4')
    expect(form).not.toHaveClass('gap-2')

    const button = screen.getByRole('button', { name: 'Adjust Ben' })
    expect(button.parentElement).toHaveClass('gap-3', 'md:gap-2')
  })

  it('sends the amount and reason for this member', async () => {
    adjustBalanceAction.mockResolvedValue(undefined)
    render(<AdjustBalanceForm member={BEN} />)
    await submit('25', 'Choir volunteer bonus')

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
