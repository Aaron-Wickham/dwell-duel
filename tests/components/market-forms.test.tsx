// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { resolveMarketAction } = vi.hoisted(() => ({
  resolveMarketAction: vi.fn(),
}))
vi.mock('@/lib/markets/resolve-market', () => ({ resolveMarketAction }))
vi.mock('@/lib/proof/upload', () => ({ uploadProof: async () => [], discardProof: async () => {} }))

import { ResolveForm } from '@/app/(app)/markets/[id]/resolve-form'

const outcomes = [
  { id: 'o-yes', label: 'Yes' },
  { id: 'o-no', label: 'No' },
]

beforeEach(() => {
  resolveMarketAction.mockReset()
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
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Final score 3–1')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm outcome' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('id', 'resolve-error')
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('market not found')
    expect(resolveMarketAction.mock.calls[0][2].get('outcome_id')).toBe('o-yes')
    expect(resolveMarketAction.mock.calls[0][2].get('note')).toBe('Final score 3–1')
  })

  it('ties a note error to the note, not the outcome', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'Say why this outcome won.', field: 'note' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), ' ')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm outcome' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox', { name: 'Winning outcome' })).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('ResolveForm over/under', () => {
  it('asks for the actual result and previews which side wins', async () => {
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 3.5' }, { id: 'u', label: 'Under 3.5' }]} line={3.5} />)
    expect(screen.queryByRole('combobox', { name: 'Winning outcome' })).not.toBeInTheDocument()
    const actual = screen.getByLabelText('Actual result')
    await userEvent.type(actual, '5')
    expect(screen.getByText('Over 3.5 wins.')).toBeInTheDocument()
    await userEvent.clear(actual)
    await userEvent.type(actual, '2')
    expect(screen.getByText('Under 3.5 wins.')).toBeInTheDocument()
  })

  it('sends the actual result with the reason', async () => {
    resolveMarketAction.mockResolvedValue(undefined)
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 3.5' }, { id: 'u', label: 'Under 3.5' }]} line={3.5} />)
    await userEvent.type(screen.getByLabelText('Actual result'), '4')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Counted on the recording')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm outcome' }))
    await vi.waitFor(() => expect(resolveMarketAction).toHaveBeenCalled())
    const data = resolveMarketAction.mock.calls[0][2] as FormData
    expect(data.get('actual')).toBe('4')
    expect(data.get('outcome_id')).toBeNull()
  })
})
