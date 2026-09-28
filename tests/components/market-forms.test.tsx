// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { resolveMarketAction } = vi.hoisted(() => ({
  resolveMarketAction: vi.fn(),
}))
vi.mock('@/lib/markets/resolve-market', () => ({ resolveMarketAction }))

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
    await userEvent.click(screen.getByRole('button', { name: 'Confirm outcome' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('id', 'resolve-error')
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('market not found')
    expect(resolveMarketAction.mock.calls[0][2].get('outcome_id')).toBe('o-yes')
  })
})
