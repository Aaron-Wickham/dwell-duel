// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomeHero } from '@/components/home/home-hero'

describe('HomeHero', () => {
  it('shows exactly one "Balance: n DC" element, plus the rank and pending caption', () => {
    render(<HomeHero balance={120} rank={3} memberCount={8} pendingCount={1} pendingDc={25} />)
    // The number is its own <span>, so the sentence is only the <p>'s combined text (Testing Library's
    // string/regex matchers read an element's own text nodes only; Playwright reads descendants too).
    expect(
      screen.getAllByText((_, element) => element?.tagName === 'P' && /Balance: \d+ DC/.test(element.textContent ?? '')),
    ).toHaveLength(1)
    expect(screen.getByText('Rank 3 of 8 · 25 DC pending in 1 task review')).toBeInTheDocument()
  })

  it('drops the pending clause when nothing is pending', () => {
    render(<HomeHero balance={50} rank={1} memberCount={1} pendingCount={0} pendingDc={0} />)
    expect(screen.getByText('Rank 1 of 1')).toBeInTheDocument()
  })
})
