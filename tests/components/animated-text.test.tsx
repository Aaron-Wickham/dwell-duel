// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnimatedText } from '@/components/ui/animated-text'

describe('AnimatedText', () => {
  it('keeps the plain text for assistive tech and Playwright, and hides the animated copy from both', () => {
    render(
      <AnimatedText plainText="42 DC">
        <span>should-not-matter</span>
      </AnimatedText>,
    )
    const plain = screen.getByText('42 DC')
    expect(plain).toHaveClass('sr-only')
    expect(plain.nextElementSibling).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies the given className to the visible, animated copy only', () => {
    render(
      <AnimatedText plainText="42 DC" className="text-2xl">
        <span>42 DC</span>
      </AnimatedText>,
    )
    // getAllByText would return the child <span>, not the aria-hidden wrapper that takes the class.
    const plain = screen.getByText('42 DC', { selector: '.sr-only' })
    expect(plain).not.toHaveClass('text-2xl')
    expect(plain.nextElementSibling).toHaveClass('text-2xl')
  })
})
