// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { createMarketAction } = vi.hoisted(() => ({ createMarketAction: vi.fn() }))
vi.mock('@/lib/markets/create-market', () => ({ createMarketAction }))

import { CreateMarketForm } from '@/app/(app)/markets/new/create-market-form'

beforeEach(() => {
  createMarketAction.mockReset()
  createMarketAction.mockResolvedValue(undefined)
})

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

  it('ties a close_at server error to the Close time field, leaving Title untouched', async () => {
    createMarketAction.mockResolvedValue({ formError: 'Choose a close time in the future.', field: 'close_at' })
    const user = userEvent.setup()
    render(<CreateMarketForm />)

    await user.type(screen.getByLabelText('Title'), 'Will it rain?')
    await user.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Create market' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Choose a close time in the future.')
    expect(alert).toHaveAttribute('id', 'create-market-error')

    const closeTime = screen.getByLabelText('Close time')
    expect(closeTime).toHaveAttribute('aria-invalid', 'true')
    expect(closeTime).toHaveAccessibleDescription('Choose a close time in the future.')

    const title = screen.getByLabelText('Title')
    expect(title).toHaveAttribute('aria-invalid', 'false')
    expect(title).not.toHaveAttribute('aria-describedby')
  })
})
