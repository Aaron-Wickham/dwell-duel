// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorCard } from '@/components/ui/error-card'

describe('ErrorCard', () => {
  it('shows the heading and body copy, and a 44px button that calls retry', async () => {
    const retry = vi.fn()
    render(<ErrorCard retry={retry} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('We couldn’t load this page. Try again in a moment.')).toBeInTheDocument()

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
