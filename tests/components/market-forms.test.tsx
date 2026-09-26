// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { placeBetAction, resolveMarketAction } = vi.hoisted(() => ({
  placeBetAction: vi.fn(),
  resolveMarketAction: vi.fn(),
}))
vi.mock('@/lib/markets/place-bet', () => ({ placeBetAction }))
vi.mock('@/lib/markets/resolve-market', () => ({ resolveMarketAction }))

import { BetForm } from '@/app/(app)/markets/[id]/bet-form'
import { ResolveForm } from '@/app/(app)/markets/[id]/resolve-form'

const outcomes = [
  { id: 'o-yes', label: 'Yes' },
  { id: 'o-no', label: 'No' },
]
const balanceError = 'Insufficient balance — you have 120 DC. Try a smaller amount.'

beforeEach(() => {
  placeBetAction.mockReset()
  resolveMarketAction.mockReset()
})

describe('BetForm', () => {
  it('labels both fields and keeps the amount placeholder', () => {
    render(<BetForm marketId="m1" outcomes={outcomes} />)
    expect(screen.getByRole('combobox', { name: 'Outcome' })).toHaveAttribute('name', 'outcome_id')
    const amount = screen.getByLabelText('Amount (DC)')
    expect(amount).toHaveAttribute('name', 'amount')
    expect(amount).toHaveAttribute('placeholder', 'Amount (DC)')
    expect(amount).toHaveAttribute('aria-invalid', 'false')
    expect(amount).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ties a server error to the amount field', async () => {
    placeBetAction.mockResolvedValue({ formError: balanceError })
    render(<BetForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Outcome' }), 'No')
    await userEvent.type(screen.getByLabelText('Amount (DC)'), '200')
    await userEvent.click(screen.getByRole('button', { name: 'Place bet' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(balanceError)
    expect(alert).toHaveAttribute('id', 'bet-error')
    const amount = screen.getByLabelText('Amount (DC)')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveAccessibleDescription(balanceError)

    const [marketId, prevState, formData] = placeBetAction.mock.calls[0]
    expect(marketId).toBe('m1')
    expect(prevState).toBeUndefined()
    expect(formData.get('outcome_id')).toBe('o-no')
    expect(formData.get('amount')).toBe('200')
  })
})

describe('ResolveForm', () => {
  it('starts on a placeholder, so the winner is always a deliberate choice', () => {
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('name', 'outcome_id')
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Choose the winner…' })).toBeDisabled()
  })

  it('ties a server error to the outcome select', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'market not found' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm outcome' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('id', 'resolve-error')
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('market not found')
    expect(resolveMarketAction.mock.calls[0][2].get('outcome_id')).toBe('o-yes')
  })
})
