// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorCard } from '@/components/ui/error-card'

describe('ErrorCard', () => {
  it('shows a card-sized heading, copy that says what to do, a 44px Try again and a way home (ST-11)', async () => {
    const retry = vi.fn()
    render(<ErrorCard retry={retry} />)

    const heading = screen.getByRole('heading', { level: 1, name: 'This page didn’t load' })
    expect(heading).not.toHaveClass('md:text-[40px]')
    expect(screen.getByText('Something went wrong on our side. Try again, or go back to Home.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/')

    const button = screen.getByRole('button', { name: 'Try again' })
    expect(button).toHaveClass('min-h-12')

    await userEvent.click(button)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('shows the digest as selectable text so a member can quote it, and nothing without one', () => {
    const { rerender } = render(<ErrorCard retry={() => {}} digest="1234567890" />)
    expect(screen.getByText('Error code: 1234567890')).toHaveClass('select-text')
    rerender(<ErrorCard retry={() => {}} />)
    expect(screen.queryByText(/Error code/)).not.toBeInTheDocument()
  })
})
