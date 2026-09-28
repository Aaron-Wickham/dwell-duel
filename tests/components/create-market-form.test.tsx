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

  it('ties a title server error to the Title field only', async () => {
    createMarketAction.mockResolvedValue({ formError: 'Enter a title.', field: 'title' })
    const user = userEvent.setup()
    render(<CreateMarketForm />)

    await user.type(screen.getByLabelText('Title'), 'x')
    await user.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Create market' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Enter a title.')

    const title = screen.getByLabelText('Title')
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAccessibleDescription('Enter a title.')

    const closeTime = screen.getByLabelText('Close time')
    expect(closeTime).toHaveAttribute('aria-invalid', 'false')
  })

  it('ties an outcomes server error to the first outcome input only, not the fieldset', async () => {
    createMarketAction.mockResolvedValue({ formError: 'Enter at least two outcomes.', field: 'outcomes' })
    const user = userEvent.setup()
    render(<CreateMarketForm />)

    await user.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    await user.type(screen.getByLabelText('Title'), 'Who wins the trivia night?')
    await user.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Create market' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Enter at least two outcomes.')

    const firstOutcome = screen.getByLabelText('Outcome 1')
    expect(firstOutcome).toHaveAttribute('aria-invalid', 'true')
    expect(firstOutcome).toHaveAccessibleDescription('Enter at least two outcomes.')

    const secondOutcome = screen.getByLabelText('Outcome 2')
    expect(secondOutcome).not.toHaveAttribute('aria-invalid')

    const fieldset = screen.getByRole('group', { name: 'Outcomes' })
    expect(fieldset).not.toHaveAttribute('aria-invalid')
  })
})

describe('CreateMarketForm over/under', () => {
  it('asks for a half-number line instead of outcomes', async () => {
    const user = userEvent.setup()
    render(<CreateMarketForm />)
    await user.click(screen.getByRole('radio', { name: 'Over/Under' }))

    const line = screen.getByLabelText('Line')
    expect(line).toHaveAttribute('step', '0.5')
    expect(line).toHaveAttribute('min', '0.5')
    expect(line).toHaveAccessibleDescription(/Use a half number, like 3.5/)
    expect(screen.queryByLabelText('Outcome 1')).not.toBeInTheDocument()
  })

  it('ties a line error to the line', async () => {
    createMarketAction.mockResolvedValue({ formError: 'Set the line to a half number, like 3.5.', field: 'line' })
    const user = userEvent.setup()
    render(<CreateMarketForm />)
    await user.type(screen.getByLabelText('Title'), 'Times Sean says bet')
    await user.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await user.click(screen.getByRole('radio', { name: 'Over/Under' }))
    await user.type(screen.getByLabelText('Line'), '3.5')
    await user.click(screen.getByRole('button', { name: 'Create market' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Line')).toHaveAttribute('aria-invalid', 'true')
    expect((createMarketAction.mock.calls[0][1] as FormData).get('kind')).toBe('over_under')
    expect((createMarketAction.mock.calls[0][1] as FormData).get('line')).toBe('3.5')
  })
})

describe('CreateMarketForm keeps what was filled in (#63)', () => {
  it('keeps the title, description and close time after a server error, with close_at still in step', async () => {
    createMarketAction.mockResolvedValue({ formError: 'Choose a close time in the future.', field: 'close_at' })
    const user = userEvent.setup()
    const { container } = render(<CreateMarketForm />)

    await user.type(screen.getByLabelText('Title'), 'Will it rain?')
    await user.type(screen.getByLabelText('Description'), 'At the picnic')
    await user.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Create market' }))
    await screen.findByRole('alert')

    expect(screen.getByLabelText('Title')).toHaveValue('Will it rain?')
    expect(screen.getByLabelText('Description')).toHaveValue('At the picnic')
    expect(screen.getByLabelText('Close time')).toHaveValue('2030-01-01T10:00')
    const closeAt = container.querySelector<HTMLInputElement>('input[name="close_at"]')!
    expect(closeAt.value).toBe(new Date('2030-01-01T10:00').toISOString())
  })

  it('keeps an over/under line after a server error', async () => {
    createMarketAction.mockResolvedValue({ formError: 'Set the line to a half number, like 3.5.', field: 'line' })
    const user = userEvent.setup()
    render(<CreateMarketForm />)

    await user.type(screen.getByLabelText('Title'), 'Minutes the sermon runs')
    await user.click(screen.getByRole('radio', { name: 'Over/Under' }))
    await user.type(screen.getByLabelText('Line'), '42.5')
    await user.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Create market' }))
    await screen.findByRole('alert')

    expect(screen.getByLabelText('Line')).toHaveValue(42.5)
    expect(screen.getByLabelText('Title')).toHaveValue('Minutes the sermon runs')
    expect(screen.getByRole('radio', { name: 'Over/Under' })).toBeChecked()
  })
})
