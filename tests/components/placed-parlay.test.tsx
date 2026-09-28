// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import type { ParlayView } from '@/lib/parlays/list-parlays'

function parlay(overrides: Partial<ParlayView>): ParlayView {
  return {
    id: 'p1',
    stake: 5,
    status: 'pending',
    credited: 0,
    multiplierBp: 160_000,
    capped: false,
    potentialPayout: 80,
    createdAt: '2026-09-25T12:00:00Z',
    legs: [
      { marketId: 'm1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', lockedOddsBp: 40_000, status: 'pending' },
      { marketId: 'm2', marketTitle: 'Who wins trivia night?', outcomeLabel: 'Grace', lockedOddsBp: 40_000, status: 'pending' },
    ],
    ...overrides,
  }
}

function renderParlay(p: ParlayView) {
  render(
    <ul>
      <PlacedParlay parlay={p} />
    </ul>,
  )
}

// The status word is its own <span>, so the whole sentence is only the <p>'s combined text.
function statusLine(text: string) {
  return screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === text)
}

describe('PlacedParlay', () => {
  it('describes a pending parlay and colours its status gold', () => {
    renderParlay(parlay({}))
    expect(statusLine('Pending — 5 DC at 16.00× — pays 80 DC if every pick wins')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toHaveClass('font-extrabold', 'text-gold')
  })

  it('describes a won parlay with what it paid', () => {
    renderParlay(parlay({ status: 'won', credited: 80 }))
    expect(statusLine('Won — 5 DC at 16.00× — paid 80 DC')).toBeInTheDocument()
    expect(screen.getByText('Won')).toHaveClass('text-win')
  })

  it('describes a lost parlay', () => {
    renderParlay(parlay({ status: 'lost' }))
    expect(statusLine('Lost — 5 DC at 16.00×')).toBeInTheDocument()
    expect(screen.getByText('Lost')).toHaveClass('text-loss')
  })

  it('describes a refunded parlay', () => {
    renderParlay(parlay({ status: 'refunded', credited: 5, multiplierBp: 10_000, potentialPayout: 5 }))
    expect(statusLine('Refunded — 5 DC returned')).toBeInTheDocument()
    expect(screen.getByText('Refunded')).toHaveClass('text-ink2')
  })

  it('notes when the multiplier was capped', () => {
    renderParlay(parlay({ multiplierBp: 1_000_000, capped: true, potentialPayout: 500 }))
    expect(statusLine('Pending — 5 DC at 100.00× — pays 500 DC if every pick wins (capped at 100×)')).toBeInTheDocument()
  })

  it('lists each leg with a link to its market, the picked outcome and a status pill', () => {
    renderParlay(
      parlay({
        status: 'lost',
        legs: [
          { marketId: 'm1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', lockedOddsBp: 40_000, status: 'won' },
          { marketId: 'm2', marketTitle: 'Who wins trivia night?', outcomeLabel: 'Grace', lockedOddsBp: 40_000, status: 'lost' },
          { marketId: 'm3', marketTitle: 'Will the choir sing?', outcomeLabel: 'No', lockedOddsBp: 20_000, status: 'voided' },
          { marketId: 'm4', marketTitle: 'Will the bake sale top $500?', outcomeLabel: 'Yes', lockedOddsBp: 20_000, status: 'pending' },
        ],
      }),
    )
    expect(screen.getByRole('link', { name: 'Will it rain?' })).toHaveAttribute('href', '/markets/m1')
    expect(screen.getByRole('link', { name: 'Who wins trivia night?' })).toHaveAttribute('href', '/markets/m2')
    expect(screen.getByText('Grace').tagName).toBe('STRONG')
    expect(screen.getByText('won')).toHaveClass('bg-acc-soft', 'text-acc-text', 'h-6', 'rounded-full')
    expect(screen.getByText('lost')).toHaveClass('bg-loss-soft', 'text-loss')
    expect(screen.getByText('voided')).toHaveClass('bg-sunk', 'text-ink2')
    expect(screen.getByText('pending')).toHaveClass('bg-gold-soft', 'text-gold')
  })

  it('gives each leg link a 44px tap target', () => {
    renderParlay(parlay({}))
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('hit-area')
  })
})
