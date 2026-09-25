// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BetList } from '@/components/markets/bet-list'
import type { MarketBet } from '@/lib/markets/get-market'

const outcomes = [
  { id: 'o-yes', label: 'Yes' },
  { id: 'o-no', label: 'No' },
]

const bets: MarketBet[] = [
  { id: 2, outcomeId: 'o-no', amount: 15, createdAt: '2026-09-25T10:00:00Z', profileId: 'p-bob', bettorName: 'Bob' },
  { id: 1, outcomeId: 'o-yes', amount: 5, createdAt: '2026-09-25T09:00:00Z', profileId: 'p-alice', bettorName: 'Alice' },
]

describe('BetList', () => {
  it("reads each bet as one sentence and marks the viewer's own", () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet />)
    const sentences = screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
    expect(sentences).toEqual(['Bob — 15 DC on No', 'Alice — 5 DC on Yes (you)'])
  })

  it("links each bettor's name to their profile", () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet />)
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/p-alice')
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveAttribute('href', '/members/p-bob')
  })

  it('invites the first bet while betting is open', () => {
    render(<BetList bets={[]} outcomes={outcomes} viewerId="p-alice" canBet />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('No bets yet.')).toBeInTheDocument()
    expect(screen.getByText('Be the first to back an outcome.')).toBeInTheDocument()
  })

  it('drops the invitation once betting has closed', () => {
    render(<BetList bets={[]} outcomes={outcomes} viewerId="p-alice" canBet={false} />)
    expect(screen.getByText('No bets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Be the first to back an outcome.')).not.toBeInTheDocument()
  })
})
