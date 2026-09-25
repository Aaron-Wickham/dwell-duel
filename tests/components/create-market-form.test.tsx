// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/markets/create-market', () => ({
  createMarketAction: vi.fn(async () => undefined),
}))

import { CreateMarketForm } from '@/app/(app)/markets/new/create-market-form'

describe('CreateMarketForm', () => {
  it('labels the title and close time fields, and defaults to a binary market', () => {
    render(<CreateMarketForm />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Close time')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Binary (Yes/No)' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Create market' })).toBeInTheDocument()
    expect(screen.queryByText('Outcomes')).not.toBeInTheDocument()
  })

  it('reveals the outcome inputs when Multiple choice is picked, capped at 6', async () => {
    const user = userEvent.setup()
    render(<CreateMarketForm />)

    await user.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    expect(screen.getByLabelText('Outcome 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Outcome 2')).toBeInTheDocument()

    const addOutcome = screen.getByRole('button', { name: 'Add outcome' })
    for (let i = 3; i <= 6; i++) {
      await user.click(addOutcome)
      expect(screen.getByLabelText(`Outcome ${i}`)).toBeInTheDocument()
    }
    expect(addOutcome).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Binary (Yes/No)' }))
    expect(screen.queryByLabelText('Outcome 1')).not.toBeInTheDocument()
  })

  it('cannot remove outcomes below the minimum of two', async () => {
    const user = userEvent.setup()
    render(<CreateMarketForm />)
    await user.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    const removeButtons = screen.getAllByRole('button', { name: /Remove outcome/ })
    expect(removeButtons).toHaveLength(2)
    for (const button of removeButtons) expect(button).toBeDisabled()
  })
})
