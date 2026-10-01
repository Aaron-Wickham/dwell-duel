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
    maxMultiplier: 20,
    lockedAtPlacement: false,
    multiplierBp: 160_000,
    capped: false,
    estimated: false,
    potentialPayout: 80,
    createdAt: '2026-09-25T12:00:00Z',
    legs: [
      { marketId: 'm1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', oddsBp: 40_000, oddsKnown: true, status: 'open' },
      { marketId: 'm2', marketTitle: 'Who wins trivia night?', outcomeLabel: 'Grace', oddsBp: 40_000, oddsKnown: true, status: 'open' },
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
  it('shows an open parlay’s stake, multiplier and what it pays if every pick wins', () => {
    renderParlay(parlay({}))
    expect(screen.getByRole('link', { name: 'Parlay · 2 picks' })).toHaveAttribute('href', '/parlays/p1')
    expect(screen.getByText('5 DC')).toBeInTheDocument()
    expect(screen.getByText('16.00×')).toBeInTheDocument()
    expect(screen.getByText('Pays if all win')).toBeInTheDocument()
    expect(screen.getByText('80 DC')).toHaveClass('text-acc-text')
    const [chip, ...legPills] = screen.getAllByText('Open')
    expect(chip).toHaveClass('bg-acc-soft', 'text-acc-text', 'h-7')
    expect(legPills.filter((el) => el.className.includes('h-6'))).toHaveLength(2)
  })

  it('shows a won parlay’s payout in the figure and the chip', () => {
    renderParlay(parlay({ status: 'won', credited: 80 }))
    expect(screen.getByText('Won 80 DC')).toBeInTheDocument()
    expect(screen.getByText('Won')).toBeInTheDocument()
    expect(screen.getByText('80 DC')).toHaveClass('text-acc-text')
  })

  it('shows a lost parlay as lost', () => {
    renderParlay(parlay({ status: 'lost' }))
    expect(screen.getAllByText('Lost')[0]).toHaveClass('bg-loss-soft', 'text-loss')
    expect(screen.getAllByText('Lost').at(-1)).toHaveClass('text-loss')
  })

  it('shows a refunded parlay’s stake as returned', () => {
    renderParlay(parlay({ status: 'refunded', credited: 5, multiplierBp: 10_000, potentialPayout: 5 }))
    expect(screen.getByText('Returned')).toBeInTheDocument()
    expect(screen.getByText('Refunded')).toHaveClass('bg-sunk', 'text-ink2')
  })

  it('notes when the multiplier was capped, at the parlay’s own cap', () => {
    renderParlay(parlay({ multiplierBp: 200_000, capped: true, potentialPayout: 100 }))
    expect(screen.getByText('Multiplier (max 20×)')).toBeInTheDocument()
    expect(screen.getByText('20.00×')).toBeInTheDocument()
  })

  it('keeps the 100× cap of a parlay placed before 0074', () => {
    renderParlay(parlay({ maxMultiplier: 100, multiplierBp: 1_000_000, capped: true, potentialPayout: 500 }))
    expect(screen.getByText('Multiplier (max 100×)')).toBeInTheDocument()
  })

  it('marks the multiplier and payout as estimates while a pick’s odds aren’t set', () => {
    renderParlay(parlay({ estimated: true }))
    expect(screen.getByText('~16.00×')).toBeInTheDocument()
    expect(screen.getByText('~80 DC')).toBeInTheDocument()
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

  it('summarises how the picks stand, with one progress segment per pick', () => {
    renderParlay(
      parlay({
        legs: [
          { marketId: 'm1', marketTitle: 'A?', outcomeLabel: 'Yes', oddsBp: 40_000, oddsKnown: true, status: 'won' },
          { marketId: 'm2', marketTitle: 'B?', outcomeLabel: 'No', oddsBp: 40_000, oddsKnown: true, status: 'open' },
          { marketId: 'm3', marketTitle: 'C?', outcomeLabel: 'No', oddsBp: 40_000, oddsKnown: true, status: 'open' },
        ],
      }),
    )
    // The summary is the visible line; the bar only repeats it, so it is hidden from readers.
    const summary = screen.getByText('1 won · 2 open')
    const bar = summary.previousElementSibling!
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar.children).toHaveLength(3)
    expect(screen.queryByRole('img', { name: '1 won · 2 open' })).toBeNull()
  })

  it('says a pick whose market is past its close time is awaiting resolution, like a solo bet', () => {
    renderParlay(
      parlay({
        legs: [
          { marketId: 'm1', marketTitle: 'A?', outcomeLabel: 'Yes', oddsBp: 40_000, oddsKnown: true, status: 'awaiting' },
          { marketId: 'm2', marketTitle: 'B?', outcomeLabel: 'No', oddsBp: 40_000, oddsKnown: true, status: 'open' },
        ],
      }),
    )
    expect(screen.getByText('Awaiting resolution')).toHaveClass('h-6', 'rounded-full')
    expect(screen.getByText('1 open · 1 awaiting')).toBeInTheDocument()
  })

  it('lists the picks as plain text with the picked outcome and a status pill, so the whole card is one link', () => {
    renderParlay(
      parlay({
        status: 'lost',
        legs: [
          { marketId: 'm1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', oddsBp: 40_000, oddsKnown: true, status: 'won' },
          { marketId: 'm2', marketTitle: 'Who wins trivia night?', outcomeLabel: 'Grace', oddsBp: 40_000, oddsKnown: true, status: 'lost' },
          { marketId: 'm3', marketTitle: 'Will the choir sing?', outcomeLabel: 'No', oddsBp: 20_000, oddsKnown: true, status: 'voided' },
        ],
      }),
    )
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText(/Will it rain\?/)).toBeInTheDocument()
    expect(screen.getByText('Grace').tagName).toBe('STRONG')
    expect(screen.getByText('Won')).toHaveClass('bg-acc-soft', 'text-acc-text', 'h-6', 'rounded-full')
    expect(screen.getByText('Voided')).toHaveClass('bg-sunk', 'text-ink2')
  })

  it('previews three picks and says how many more the breakdown holds', () => {
    const legs = Array.from({ length: 5 }, (_, i) => ({
      marketId: `m${i}`,
      marketTitle: `Market ${i}?`,
      outcomeLabel: 'Yes',
      oddsBp: 20_000, oddsKnown: true,
      status: 'open' as const,
    }))
    renderParlay(parlay({ legs }))
    expect(screen.getByText(/Market 2\?/)).toBeInTheDocument()
    expect(screen.queryByText(/Market 3\?/)).toBeNull()
    expect(screen.getByText('+2 more picks · View breakdown')).toBeInTheDocument()
  })

  it('stretches its one link over the card so the whole card is the tap target', () => {
    renderParlay(parlay({}))
    expect(screen.getByRole('link')).toHaveClass('stretched-link')
    expect(screen.getByRole('link').closest('.pressable')).toHaveClass('relative')
  })
})
