// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BetaBadge } from '@/components/brand/beta-badge'

describe('BetaBadge', () => {
  it('is a plain span reading Beta, not a control', () => {
    render(<BetaBadge />)
    const badge = screen.getByText('Beta')
    expect(badge.tagName).toBe('SPAN')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('uses token classes, not a raw colour, and accepts extra classes for placement', () => {
    render(<BetaBadge className="ml-2" />)
    const badge = screen.getByText('Beta')
    expect(badge).toHaveClass('bg-sunk', 'text-ink2', 'ml-2')
    expect(badge.className).not.toMatch(/-(red|green|blue|yellow)-/)
  })
})
