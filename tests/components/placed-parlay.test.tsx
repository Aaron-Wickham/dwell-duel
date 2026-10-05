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
    converted: false,
    fixed: false,
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

// The card's line under its title, which splits its figure into its own span.
const line = (text: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)

describe('PlacedParlay', () => {
  it('says what an open parlay pays if all win, in the line under its title (#393)', () => {
    renderParlay(parlay({}))
    expect(screen.getByRole('link', { name: 'Parlay · 2 picks' })).toHaveAttribute('href', '/parlays/p1')
    expect(line('5 DC · pays 80 DC if all win')).toBeInTheDocument()
    expect(screen.getByText('80 DC')).toHaveClass('text-win')
    // No chip and no multiplier on the card: only the picks' words.
    expect(screen.queryByText('Open')).toBeNull()
    expect(screen.queryByText(/×/)).toBeNull()
    expect(screen.getAllByText('Waiting')).toHaveLength(2)
  })

  it('says what a won parlay paid', () => {
    renderParlay(parlay({ status: 'won', credited: 80 }))
    expect(line('5 DC · won 80 DC')).toBeInTheDocument()
    expect(screen.getByText('80 DC')).toHaveClass('text-win')
  })

  it('says a lost parlay lost, once', () => {
    renderParlay(parlay({ status: 'lost' }))
    expect(line('5 DC · lost')).toBeInTheDocument()
    expect(screen.getByText('lost')).toHaveClass('text-loss')
  })

  it('says a refunded parlay was refunded', () => {
    renderParlay(parlay({ status: 'refunded', credited: 5, multiplierBp: 10_000, potentialPayout: 5 }))
    expect(line('5 DC · refunded')).toBeInTheDocument()
  })

  it('marks the payout as an estimate while a pick’s odds aren’t set', () => {
    renderParlay(parlay({ estimated: true }))
    expect(line('5 DC · pays ~80 DC if all win')).toBeInTheDocument()
  })

  it('shows the day it was placed beside the title', () => {
    renderParlay(parlay({}))
    expect(screen.getByText('Placed').parentElement).toHaveTextContent('Placed Sep 25')
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

  it('spans both columns of the desktop grid', () => {
    renderParlay(parlay({}))
    expect(screen.getByRole('link').closest('li')).toHaveClass('lg:col-span-full')
  })

  it('lists the picks as plain lines, "Market · Pick", with a word for each result, so the whole card is one link', () => {
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
    expect(screen.getByText(/Will it rain\? ·/)).toBeInTheDocument()
    expect(screen.getByText('Grace').tagName).toBe('STRONG')
    expect(screen.getByText('Won')).toHaveClass('text-win')
    expect(screen.getByText('Won')).not.toHaveClass('rounded-full')
    expect(screen.getByText('Lost')).toHaveClass('text-loss')
    expect(screen.getByText('Called off')).toHaveClass('text-ink2')
  })

  it('says a pick past its market’s close time is Waiting, like an open one', () => {
    renderParlay(
      parlay({
        legs: [
          { marketId: 'm1', marketTitle: 'A?', outcomeLabel: 'Yes', oddsBp: 40_000, oddsKnown: true, status: 'awaiting' },
          { marketId: 'm2', marketTitle: 'B?', outcomeLabel: 'No', oddsBp: 40_000, oddsKnown: true, status: 'open' },
        ],
      }),
    )
    expect(screen.getAllByText('Waiting')).toHaveLength(2)
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
    expect(screen.getByText('+2 more picks')).toBeInTheDocument()
  })

  it('stretches its one link over the card so the whole card is the tap target', () => {
    renderParlay(parlay({}))
    expect(screen.getByRole('link')).toHaveClass('stretched-link')
    expect(screen.getByRole('link').closest('.pressable')).toHaveClass('relative')
  })
})
