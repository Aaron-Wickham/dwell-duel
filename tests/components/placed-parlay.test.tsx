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

describe('PlacedParlay', () => {
  it('describes a pending parlay, with what it pays if every pick wins', () => {
    renderParlay(parlay({}))
    expect(screen.getByText('Parlay · 2 picks')).toBeInTheDocument()
    expect(screen.getByText(/^5 DC at 16\.00× · pays 80 DC if every pick wins · Placed/)).toBeInTheDocument()
    const [chip, ...legPills] = screen.getAllByText('Open')
    expect(chip).toHaveClass('bg-acc-soft', 'text-acc-text', 'h-7')
    expect(legPills).toHaveLength(2)
  })

  it('describes a won parlay with what it paid', () => {
    renderParlay(parlay({ status: 'won', credited: 80 }))
    expect(screen.getByText(/^5 DC at 16\.00× · Placed/)).toBeInTheDocument()
    expect(screen.getByText('Won 80 DC')).toBeInTheDocument()
  })

  it('describes a lost parlay', () => {
    renderParlay(parlay({ status: 'lost' }))
    expect(screen.getByText(/^5 DC at 16\.00× · Placed/)).toBeInTheDocument()
    expect(screen.getByText('Lost')).toHaveClass('bg-loss-soft', 'text-loss')
  })

  it('describes a refunded parlay', () => {
    renderParlay(parlay({ status: 'refunded', credited: 5, multiplierBp: 10_000, potentialPayout: 5 }))
    expect(screen.getByText(/^5 DC returned · Placed/)).toBeInTheDocument()
    expect(screen.getByText('Refunded')).toHaveClass('bg-sunk', 'text-ink2')
  })

  it('notes when the multiplier was capped', () => {
    renderParlay(parlay({ multiplierBp: 1_000_000, capped: true, potentialPayout: 500 }))
    expect(screen.getByText(/^5 DC at 100\.00× \(capped at 100×\) · pays 500 DC if every pick wins/)).toBeInTheDocument()
  })

  it('is a Show more focus target named by its heading when given a row id', () => {
    render(
      <ul>
        <PlacedParlay parlay={parlay({})} domId="open-parlay_003ap1" />
      </ul>,
    )
    const row = screen.getByRole('listitem', { name: 'Parlay · 2 picks' })
    expect(row).toHaveAttribute('id', 'open-parlay_003ap1')
    expect(row).toHaveAttribute('tabindex', '-1')
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
    expect(screen.getByText('Won')).toHaveClass('bg-acc-soft', 'text-acc-text', 'h-6', 'rounded-full')
    expect(screen.getAllByText('Lost').at(-1)).toHaveClass('bg-loss-soft', 'text-loss', 'h-6')
    expect(screen.getByText('Voided')).toHaveClass('bg-sunk', 'text-ink2')
    expect(screen.getByText('Open')).toHaveClass('bg-gold-soft', 'text-gold')
  })

  it('gives each leg link a 44px tap target', () => {
    renderParlay(parlay({}))
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('hit-area')
  })
})
