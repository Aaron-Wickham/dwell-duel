// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Wordmark } from '@/components/brand/wordmark'

describe('Wordmark', () => {
  it('is a home link named for the app, with the two-colour word', () => {
    render(<Wordmark />)
    const link = screen.getByRole('link', { name: 'DwellDuel home' })
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveTextContent('DwellDuel')
    expect(screen.getByText('Dwell')).toHaveClass('text-wm-a')
    expect(screen.getByText('Duel')).toHaveClass('text-wm-b')
  })

  it('hides the symbol from assistive tech', () => {
    const { container } = render(<Wordmark size="sm" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
